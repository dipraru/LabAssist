import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/entities/user.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { TempJudge } from '../users/entities/temp-judge.entity';
import { Semester } from '../courses/entities/semester.entity';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { Batch, BatchSection } from './entities/batch.entity';
import {
  ProfileChangeApplication,
  ProfileChangeApplicationStatus,
} from './entities/profile-change-application.entity';
import { SemesterName } from '../../common/enums';
import { UserRole } from '../../common/enums/role.enum';
import { LabTest, LabTestStatus } from '../lab-tests/entities/lab-test.entity';
import {
  CreateTeacherDto,
  CreateStudentsBulkDto,
  CreateTempJudgeDto,
  ExtendTempJudgeDto,
  CorrectStudentDto,
  CorrectTeacherDto,
  CreateStudentDto,
  CreateBatchDto,
  CreateSemesterDto,
  UpdateSemesterStartDateDto,
} from './dto/office.dto';

const SEMESTER_SEQUENCE = Object.values(SemesterName);

function parseDateInput(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Invalid start date');
  }
  return parsed;
}

function getSemesterOrder(name: string): number {
  return SEMESTER_SEQUENCE.indexOf(name as (typeof SEMESTER_SEQUENCE)[number]);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join('');
}

function parseStudentId(id: string): {
  batchYear: string;
  deptCode: string;
  rollNumber: string;
} {
  // Format: 2107070 → batch=21, dept=07, roll=070
  const str = id.trim();
  if (str.length !== 7)
    throw new BadRequestException(`Invalid student ID format: ${id}`);
  return {
    batchYear: str.substring(0, 2),
    deptCode: str.substring(2, 4),
    rollNumber: str.substring(4, 7),
  };
}

function normalizeBatchYear(batchYear: string): string {
  const trimmed = batchYear.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) {
    throw new BadRequestException('Batch year is required');
  }

  let year: number;
  if (digitsOnly.length === 2) {
    year = parseInt(`20${digitsOnly}`, 10);
  } else if (digitsOnly.length === 4) {
    year = parseInt(digitsOnly, 10);
  } else {
    throw new BadRequestException(
      'Batch year must be a valid year (e.g. 2021)',
    );
  }

  const currentYear = new Date().getFullYear();
  if (year < 2000 || year > currentYear + 1) {
    throw new BadRequestException(
      `Batch year must be between 2000 and ${currentYear + 1}`,
    );
  }

  return String(year);
}

function getTwoDigitBatchFromYear(year: string): string {
  return year.slice(-2);
}

function batchYearVariants(batchYear: string): string[] {
  const digits = batchYear.replace(/\D/g, '');
  if (digits.length === 4) return [digits, digits.slice(2)];
  if (digits.length === 2) return [digits, `20${digits}`];
  return [batchYear];
}

function buildCountLabel(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function parseStudentsCsv(
  csvText: string,
): { studentId: string; fullName?: string }[] {
  const normalized = csvText.replace(/^\uFEFF/, '');
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    throw new BadRequestException('CSV must include at least one student row');
  }

  const firstRowColumns = parseCsvLine(lines[0]);
  const normalizedHeaders = firstRowColumns.map((header) =>
    header.toLowerCase().replace(/\s+/g, ''),
  );
  const studentIdIndexFromHeader = normalizedHeaders.findIndex((header) =>
    ['studentid', 'student_id', 'id'].includes(header),
  );
  const fullNameIndexFromHeader = normalizedHeaders.findIndex((header) =>
    ['fullname', 'full_name', 'name'].includes(header),
  );

  const hasHeader = studentIdIndexFromHeader !== -1;
  const dataStartIndex = hasHeader ? 1 : 0;
  const studentIdIndex = hasHeader ? studentIdIndexFromHeader : 0;
  const fullNameIndex = hasHeader ? fullNameIndexFromHeader : 1;

  if (hasHeader && lines.length < 2) {
    throw new BadRequestException(
      'CSV includes header but no student rows were found',
    );
  }

  const rows: { studentId: string; fullName?: string }[] = [];
  const seenStudentIds = new Set<string>();

  for (let lineIndex = dataStartIndex; lineIndex < lines.length; lineIndex++) {
    const rowNumber = lineIndex + 1;
    const columns = parseCsvLine(lines[lineIndex]);
    const studentId = (columns[studentIdIndex] ?? '').trim();
    const fullName =
      fullNameIndex >= 0 ? (columns[fullNameIndex] ?? '').trim() : '';

    if (!studentId) {
      throw new BadRequestException(`Missing studentId at row ${rowNumber}`);
    }

    if (!/^\d{7}$/.test(studentId)) {
      throw new BadRequestException(
        `Invalid studentId '${studentId}' at row ${rowNumber}. Expected 7 digits.`,
      );
    }

    if (seenStudentIds.has(studentId)) {
      throw new BadRequestException(
        `Duplicate studentId '${studentId}' in CSV at row ${rowNumber}`,
      );
    }

    seenStudentIds.add(studentId);
    rows.push({
      studentId,
      fullName: fullName || undefined,
    });
  }

  if (!rows.length) {
    throw new BadRequestException('CSV does not contain any student rows');
  }

  if (rows.length > 200) {
    throw new BadRequestException(
      'Cannot import more than 200 students at once',
    );
  }

  return rows;
}

@Injectable()
export class OfficeService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(TempJudge) private judgeRepo: Repository<TempJudge>,
    @InjectRepository(Semester) private semesterRepo: Repository<Semester>,
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
    @InjectRepository(LabTest) private labTestRepo: Repository<LabTest>,
    @InjectRepository(ProfileChangeApplication)
    private profileChangeApplicationRepo: Repository<ProfileChangeApplication>,
    private readonly dataSource: DataSource,
  ) {}

  private normalizeBatchSections(
    batchYear: string,
    sectionCount: number,
    sections: CreateBatchDto['sections'],
  ): BatchSection[] {
    if (sectionCount === 1) {
      if (sections.length > 0) {
        throw new BadRequestException(
          'Do not submit section details when section count is 1',
        );
      }
      return [];
    }

    if (sections.length !== sectionCount) {
      throw new BadRequestException(
        `Expected ${sectionCount} section definitions`,
      );
    }

    const seenNames = new Set<string>();
    const normalized = sections.map((section, index) => {
      const name = section.name.trim();
      if (!name) {
        throw new BadRequestException(
          `Section name is required for section ${index + 1}`,
        );
      }

      const key = name.toLowerCase();
      if (seenNames.has(key)) {
        throw new BadRequestException(`Duplicate section name '${name}'`);
      }
      seenNames.add(key);

      const fromStudentId = section.fromStudentId.trim();
      const toStudentId = section.toStudentId.trim();
      const fromParsed = parseStudentId(fromStudentId);
      const toParsed = parseStudentId(toStudentId);
      const expectedBatch = getTwoDigitBatchFromYear(batchYear);

      if (
        fromParsed.batchYear !== expectedBatch ||
        toParsed.batchYear !== expectedBatch
      ) {
        throw new BadRequestException(
          `Section '${name}' student IDs must belong to batch ${batchYear}`,
        );
      }

      if (fromStudentId > toStudentId) {
        throw new BadRequestException(
          `Section '${name}' has an invalid student ID range`,
        );
      }

      return { name, fromStudentId, toStudentId };
    });

    const sorted = [...normalized].sort((left, right) =>
      left.fromStudentId.localeCompare(right.fromStudentId),
    );

    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (current.fromStudentId <= previous.toStudentId) {
        throw new BadRequestException(
          `Sections '${previous.name}' and '${current.name}' have overlapping student ID ranges`,
        );
      }
    }

    return normalized;
  }

  private getExpectedSemesterName(
    semesters: Semester[],
  ): SemesterName | null {
    for (const name of SEMESTER_SEQUENCE) {
      if (!semesters.some((semester) => semester.name === name)) {
        return name;
      }
    }
    return null;
  }

  private async syncBatchCurrentSemester(batchYear: string): Promise<void> {
    const semesters = await this.semesterRepo.find({
      where: { batchYear },
      order: { startDate: 'ASC', name: 'ASC' },
    });

    const today = startOfUtcDay(new Date());
    const current = semesters
      .filter(
        (semester) =>
          semester.startDate &&
          startOfUtcDay(new Date(semester.startDate)) <= today,
      )
      .sort((left, right) => {
        const leftDate = new Date(left.startDate as Date).getTime();
        const rightDate = new Date(right.startDate as Date).getTime();
        if (leftDate !== rightDate) return rightDate - leftDate;
        return getSemesterOrder(right.name) - getSemesterOrder(left.name);
      })[0];

    await this.semesterRepo.update({ batchYear }, { isCurrent: false });
    if (current) {
      await this.semesterRepo.update(current.id, { isCurrent: true });
    }
  }

  private validateSemesterTimeline(
    semesters: Semester[],
    targetName: Semester['name'],
    startDate: Date,
    semesterIdToIgnore?: string,
  ) {
    const relevantSemesters = semesters.filter(
      (semester) => semester.id !== semesterIdToIgnore,
    );
    const targetOrder = getSemesterOrder(targetName);
    if (targetOrder === -1) {
      throw new BadRequestException('Invalid semester name');
    }

    if (targetOrder > 0) {
      const previousName = SEMESTER_SEQUENCE[targetOrder - 1];
      const previous = relevantSemesters.find(
        (semester) => semester.name === previousName,
      );
      if (!previous) {
        throw new BadRequestException(
          `${previousName.replace('_', ' ')} must be created first`,
        );
      }
      if (!previous.startDate) {
        throw new BadRequestException(
          `${previousName.replace('_', ' ')} must have a start date`,
        );
      }
      if (startOfUtcDay(new Date(previous.startDate)) > startOfUtcDay(new Date())) {
        throw new BadRequestException(
          `${previousName.replace('_', ' ')} has not started yet`,
        );
      }
      if (startOfUtcDay(startDate) < startOfUtcDay(new Date(previous.startDate))) {
        throw new BadRequestException(
          `Start date cannot be before ${previousName.replace('_', ' ')}`,
        );
      }
    }

    if (targetOrder < SEMESTER_SEQUENCE.length - 1) {
      const nextName = SEMESTER_SEQUENCE[targetOrder + 1];
      const next = relevantSemesters.find((semester) => semester.name === nextName);
      if (
        next?.startDate &&
        startOfUtcDay(startDate) > startOfUtcDay(new Date(next.startDate))
      ) {
        throw new BadRequestException(
          `Start date cannot be after ${nextName.replace('_', ' ')}`,
        );
      }
    }
  }

  private async autoEnrollStudentIntoCurrentCourses(
    manager: EntityManager,
    student: Student,
  ): Promise<void> {
    const currentSemesters = await manager.find(Semester, {
      where: {
        batchYear: In(batchYearVariants(student.batchYear)),
        isCurrent: true,
      },
      select: ['id'],
    });

    if (!currentSemesters.length) {
      return;
    }

    const courses = await manager.find(Course, {
      where: {
        semesterId: In(currentSemesters.map((semester) => semester.id)),
        isActive: true,
      },
      select: ['id'],
    });

    if (!courses.length) {
      return;
    }

    const existingEnrollments = await manager.find(Enrollment, {
      where: {
        studentId: student.id,
        courseId: In(courses.map((course) => course.id)),
      },
      select: ['courseId'],
    });

    const enrolledCourseIds = new Set(
      existingEnrollments.map((enrollment) => enrollment.courseId),
    );

    const newEnrollments = courses
      .filter((course) => !enrolledCourseIds.has(course.id))
      .map((course) =>
        manager.create(Enrollment, {
          courseId: course.id,
          studentId: student.id,
          isActive: true,
        }),
      );

    if (!newEnrollments.length) {
      return;
    }

    await manager.save(Enrollment, newEnrollments);
  }

  // ────────────────────────────────────────────────────────
  // TEACHER MANAGEMENT
  // ────────────────────────────────────────────────────────

  async createTeacher(
    dto: CreateTeacherDto,
  ): Promise<{ teacher: Teacher; plainPassword: string }> {
    if (!dto.profilePhoto?.trim()) {
      throw new BadRequestException('Teacher photo is required');
    }

    const existing = await this.userRepo.findOne({
      where: { username: dto.teacherId },
    });
    if (existing)
      throw new ConflictException(`Teacher ID ${dto.teacherId} already exists`);

    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const user = queryRunner.manager.create(User, {
        username: dto.teacherId,
        password: hashedPassword,
        role: UserRole.TEACHER,
        isFirstLogin: false, // teacher doesn't need profile setup
        isActive: true,
        passwordChangeSuggested: true,
      });
      const savedUser = await queryRunner.manager.save(user);

      const teacher = queryRunner.manager.create(Teacher, {
        teacherId: dto.teacherId,
        fullName: dto.fullName,
        designation: dto.designation,
        email: dto.email,
        phone: dto.phone.trim(),
        gender: dto.gender ?? null,
        profilePhoto: dto.profilePhoto.trim(),
        userId: savedUser.id,
      });
      const savedTeacher = await queryRunner.manager.save(teacher);
      await queryRunner.commitTransaction();
      return { teacher: savedTeacher, plainPassword };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  // ────────────────────────────────────────────────────────
  // STUDENT BULK CREATION
  // ────────────────────────────────────────────────────────

  async createStudent(
    dto: CreateStudentDto,
  ): Promise<{ student: Student; plainPassword: string }> {
    const existing = await this.userRepo.findOne({
      where: { username: dto.studentId },
    });
    if (existing)
      throw new ConflictException(`Student ID ${dto.studentId} already exists`);

    const parsed = parseStudentId(dto.studentId);
    const normalizedBatchYear = normalizeBatchYear(dto.batchYear);
    if (parsed.batchYear !== getTwoDigitBatchFromYear(normalizedBatchYear)) {
      throw new BadRequestException(
        `Student ID batch (${parsed.batchYear}) does not match provided batch (${normalizedBatchYear})`,
      );
    }
    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = queryRunner.manager.create(User, {
        username: dto.studentId,
        password: hashedPassword,
        role: UserRole.STUDENT,
        isFirstLogin: true,
        isActive: true,
        passwordChangeSuggested: true,
      });
      const savedUser = await queryRunner.manager.save(user);

      const student = queryRunner.manager.create(Student, {
        studentId: dto.studentId,
        batchYear: normalizedBatchYear,
        deptCode: parsed.deptCode,
        rollNumber: parsed.rollNumber,
        fullName: dto.fullName ?? null,
        profileCompleted: false,
        userId: savedUser.id,
      });
      const savedStudent = await queryRunner.manager.save(student);
      await this.autoEnrollStudentIntoCurrentCourses(
        queryRunner.manager,
        savedStudent,
      );
      await queryRunner.commitTransaction();
      return { student: savedStudent, plainPassword };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async createStudentsBulk(dto: CreateStudentsBulkDto): Promise<{
    credentials: { username: string; password: string; name: string }[];
  }> {
    const normalizedBatchYear = normalizeBatchYear(dto.batchYear);
    if (!dto.fromStudentId || !dto.toStudentId) {
      throw new BadRequestException(
        'fromStudentId and toStudentId are required for range import',
      );
    }
    const from = parseInt(dto.fromStudentId, 10);
    const to = parseInt(dto.toStudentId, 10);
    if (isNaN(from) || isNaN(to) || from > to) {
      throw new BadRequestException('Invalid student ID range');
    }
    if (to - from > 200) {
      throw new BadRequestException(
        'Cannot create more than 200 students at once',
      );
    }

    const credentials: { username: string; password: string; name: string }[] =
      [];
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (let idNum = from; idNum <= to; idNum++) {
        const studentId = idNum.toString().padStart(7, '0');
        // Skip if already exists
        const exists = await queryRunner.manager.findOne(User, {
          where: { username: studentId },
        });
        if (exists) continue;

        const parsed = parseStudentId(studentId);
        if (
          parsed.batchYear !== getTwoDigitBatchFromYear(normalizedBatchYear)
        ) {
          throw new BadRequestException(
            `Student ID ${studentId} does not match batch ${normalizedBatchYear}`,
          );
        }
        const plainPassword = generatePassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        const user = queryRunner.manager.create(User, {
          username: studentId,
          password: hashedPassword,
          role: UserRole.STUDENT,
          isFirstLogin: true,
          isActive: true,
          passwordChangeSuggested: true,
        });
        const savedUser = await queryRunner.manager.save(user);

        const student = queryRunner.manager.create(Student, {
          studentId,
          batchYear: normalizedBatchYear,
          deptCode: parsed.deptCode,
          rollNumber: parsed.rollNumber,
          profileCompleted: false,
          userId: savedUser.id,
        });
        const savedStudent = await queryRunner.manager.save(student);
        await this.autoEnrollStudentIntoCurrentCourses(
          queryRunner.manager,
          savedStudent,
        );
        credentials.push({
          username: studentId,
          password: plainPassword,
          name: `Student ${studentId}`,
        });
      }
      await queryRunner.commitTransaction();
      return { credentials };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async createStudentsBulkFromCsv(
    csvBuffer: Buffer,
    batchYear: string,
  ): Promise<{
    credentials: { username: string; password: string; name: string }[];
    totalRows: number;
    createdCount: number;
    skippedCount: number;
  }> {
    const normalizedBatchYear = normalizeBatchYear(batchYear);
    const students = parseStudentsCsv(csvBuffer.toString('utf8'));
    const credentials: { username: string; password: string; name: string }[] =
      [];
    let createdCount = 0;
    let skippedCount = 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const row of students) {
        const exists = await queryRunner.manager.findOne(User, {
          where: { username: row.studentId },
        });
        if (exists) {
          skippedCount += 1;
          continue;
        }

        const parsed = parseStudentId(row.studentId);
        if (
          parsed.batchYear !== getTwoDigitBatchFromYear(normalizedBatchYear)
        ) {
          throw new BadRequestException(
            `Student ID ${row.studentId} does not match batch ${normalizedBatchYear}`,
          );
        }
        const plainPassword = generatePassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        const user = queryRunner.manager.create(User, {
          username: row.studentId,
          password: hashedPassword,
          role: UserRole.STUDENT,
          isFirstLogin: true,
          isActive: true,
          passwordChangeSuggested: true,
        });
        const savedUser = await queryRunner.manager.save(user);

        const student = queryRunner.manager.create(Student, {
          studentId: row.studentId,
          batchYear: normalizedBatchYear,
          deptCode: parsed.deptCode,
          rollNumber: parsed.rollNumber,
          fullName: row.fullName ?? null,
          profileCompleted: false,
          userId: savedUser.id,
        });
        const savedStudent = await queryRunner.manager.save(student);
        await this.autoEnrollStudentIntoCurrentCourses(
          queryRunner.manager,
          savedStudent,
        );

        createdCount += 1;
        credentials.push({
          username: row.studentId,
          password: plainPassword,
          name: row.fullName ?? `Student ${row.studentId}`,
        });
      }

      await queryRunner.commitTransaction();
      return {
        credentials,
        totalRows: students.length,
        createdCount,
        skippedCount,
      };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  // ────────────────────────────────────────────────────────
  // TEMP JUDGE MANAGEMENT
  // ────────────────────────────────────────────────────────

  async createTempJudge(
    dto: CreateTempJudgeDto,
    officeUserId: string,
  ): Promise<{ judge: TempJudge; plainPassword: string }> {
    const count = await this.judgeRepo.count();
    const judgeId = `TJ-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 12);
    const accessFrom = new Date();
    const accessUntil = new Date(dto.accessUntil);

    if (isNaN(accessUntil.getTime())) {
      throw new BadRequestException('Invalid access until date');
    }
    if (accessUntil <= accessFrom) {
      throw new BadRequestException('Access until must be after current time');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const user = queryRunner.manager.create(User, {
        username: judgeId,
        password: hashedPassword,
        role: UserRole.TEMP_JUDGE,
        isFirstLogin: false,
        isActive: true,
        expiresAt: accessUntil,
        passwordChangeSuggested: false,
      });
      const savedUser = await queryRunner.manager.save(user);

      const judge = queryRunner.manager.create(TempJudge, {
        judgeId,
        fullName: dto.fullName?.trim() || `Temp Judge ${judgeId}`,
        accessFrom,
        accessUntil,
        notes: dto.notes ?? null,
        latestIssuedPassword: plainPassword,
        userId: savedUser.id,
        createdByOfficeId: officeUserId,
      });
      const savedJudge = await queryRunner.manager.save(judge);
      await queryRunner.commitTransaction();
      return { judge: savedJudge, plainPassword };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async extendTempJudge(
    judgeId: string,
    dto: ExtendTempJudgeDto,
  ): Promise<TempJudge> {
    const judge = await this.judgeRepo.findOne({ where: { id: judgeId } });
    if (!judge) throw new NotFoundException('Judge not found');

    const nextUntil = new Date(dto.newAccessUntil);
    if (isNaN(nextUntil.getTime())) {
      throw new BadRequestException('Invalid extension date');
    }
    if (nextUntil <= new Date()) {
      throw new BadRequestException(
        'New access deadline must be in the future',
      );
    }

    judge.accessUntil = nextUntil;
    await this.userRepo.update(judge.userId, {
      expiresAt: nextUntil,
      isActive: true,
    });
    return this.judgeRepo.save(judge);
  }

  async resetTempJudgeCredentials(
    judgeId: string,
  ): Promise<{ judge: TempJudge; plainPassword: string }> {
    const judge = await this.judgeRepo.findOne({ where: { id: judgeId } });
    if (!judge) throw new NotFoundException('Judge not found');

    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    await this.userRepo.update(judge.userId, {
      password: hashedPassword,
      isActive: true,
      passwordChangeSuggested: false,
      expiresAt: judge.accessUntil,
    });

    judge.latestIssuedPassword = plainPassword;
    await this.judgeRepo.save(judge);

    return { judge, plainPassword };
  }

  async getTempJudgeCredentials(
    judgeId: string,
  ): Promise<{ judge: TempJudge; plainPassword: string }> {
    return this.resetTempJudgeCredentials(judgeId);
  }

  async getAllJudges(): Promise<TempJudge[]> {
    return this.judgeRepo.find({ order: { createdAt: 'DESC' } });
  }

  // ────────────────────────────────────────────────────────
  // OFFICE CORRECTIONS
  // ────────────────────────────────────────────────────────

  async correctStudentInfo(dto: CorrectStudentDto): Promise<Student> {
    const student = await this.studentRepo.findOne({
      where: { userId: dto.studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');

    if (dto.fullName) student.fullName = dto.fullName;
    if (dto.dateOfBirth) student.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.email) student.email = dto.email;
    return this.studentRepo.save(student);
  }

  async correctTeacherInfo(dto: CorrectTeacherDto): Promise<Teacher> {
    const teacher = await this.teacherRepo.findOne({
      where: { userId: dto.teacherUserId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    if (dto.fullName) teacher.fullName = dto.fullName;
    if (dto.email) teacher.email = dto.email;
    return this.teacherRepo.save(teacher);
  }

  async toggleUserActive(userId: string, isActive: boolean): Promise<void> {
    await this.userRepo.update(userId, { isActive });
  }

  async getProfileChangeApplications(): Promise<ProfileChangeApplication[]> {
    return this.profileChangeApplicationRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getProfileChangeApplicationById(
    id: string,
  ): Promise<ProfileChangeApplication> {
    const application = await this.profileChangeApplicationRepo.findOne({
      where: { id },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    return application;
  }

  async reviewProfileChangeApplication(
    id: string,
    status: ProfileChangeApplicationStatus,
    officeUserId: string,
  ): Promise<ProfileChangeApplication> {
    const application = await this.getProfileChangeApplicationById(id);
    if (application.status !== ProfileChangeApplicationStatus.PENDING) {
      throw new BadRequestException('This application has already been reviewed');
    }

    const officeUser = await this.userRepo.findOne({
      where: { id: officeUserId },
    });

    if (status === ProfileChangeApplicationStatus.APPROVED) {
      if (application.requesterRole === UserRole.STUDENT) {
        const student = await this.studentRepo.findOne({
          where: { userId: application.requesterUserId },
        });
        if (!student) {
          throw new NotFoundException('Student not found');
        }

        if (application.requestedData.fullName) {
          student.fullName = application.requestedData.fullName;
        }
        if (application.requestedData.email) {
          student.email = application.requestedData.email;
        }
        if (application.requestedData.dateOfBirth) {
          student.dateOfBirth = new Date(application.requestedData.dateOfBirth);
        }
        if (application.requestedData.guardianPhone) {
          student.guardianPhone = application.requestedData.guardianPhone;
        }
        if (application.requestedData.fathersName) {
          student.fathersName = application.requestedData.fathersName;
        }
        if (application.requestedData.gender) {
          student.gender = application.requestedData.gender;
        }
        if (application.requestedData.mothersName) {
          student.mothersName = application.requestedData.mothersName;
        }
        if (application.requestedData.permanentAddress) {
          student.permanentAddress = application.requestedData.permanentAddress;
        }
        if (application.requestedPhoto) {
          student.profilePhoto = application.requestedPhoto;
        }
        student.profileCompleted = Boolean(
          student.phone &&
            student.email &&
            student.fathersName &&
            student.mothersName &&
            student.dateOfBirth,
        );
        await this.studentRepo.save(student);
      } else if (application.requesterRole === UserRole.TEACHER) {
        const teacher = await this.teacherRepo.findOne({
          where: { userId: application.requesterUserId },
        });
        if (!teacher) {
          throw new NotFoundException('Teacher not found');
        }

        if (application.requestedData.fullName) {
          teacher.fullName = application.requestedData.fullName;
        }
        if (application.requestedData.email) {
          teacher.email = application.requestedData.email;
        }
        if (application.requestedData.gender) {
          teacher.gender = application.requestedData.gender;
        }
        if (application.requestedPhoto) {
          teacher.profilePhoto = application.requestedPhoto;
        }
        await this.teacherRepo.save(teacher);
      }
    }

    application.status = status;
    application.reviewedByOfficeId = officeUserId;
    application.reviewedByName = officeUser?.username ?? 'Office';
    application.reviewedAt = new Date();

    return this.profileChangeApplicationRepo.save(application);
  }

  // ────────────────────────────────────────────────────────
  // DASHBOARD DATA
  // ────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [
      teacherCount,
      studentCount,
      judgeCount,
      batchCount,
      activeSemesterCount,
      courseCount,
      activeLabTestCount,
      pendingApplicationCount,
    ] = await Promise.all([
      this.teacherRepo.count(),
      this.studentRepo.count(),
      this.judgeRepo.count(),
      this.batchRepo.count(),
      this.semesterRepo.count({ where: { isCurrent: true } }),
      this.courseRepo.count(),
      this.labTestRepo.count({
        where: { status: LabTestStatus.RUNNING },
      }),
      this.profileChangeApplicationRepo.count({
        where: { status: ProfileChangeApplicationStatus.PENDING },
      }),
    ]);
    return {
      teacherCount,
      studentCount,
      judgeCount,
      batchCount,
      activeSemesterCount,
      courseCount,
      activeLabTestCount,
      pendingApplicationCount,
    };
  }

  async getAllTeachers(): Promise<Teacher[]> {
    return this.teacherRepo.find({
      order: { designation: 'ASC', fullName: 'ASC' },
    });
  }

  async getAllStudents(batchYear?: string): Promise<
    Array<
      Student & {
        canDelete: boolean;
        deleteBlockReason: string | null;
      }
    >
  > {
    const normalizedBatchYear = batchYear?.trim()
      ? normalizeBatchYear(batchYear)
      : undefined;
    const where = normalizedBatchYear ? { batchYear: normalizedBatchYear } : {};
    const students = await this.studentRepo.find({
      where,
      order: { studentId: 'ASC' },
    });

    return students.map((student) =>
      Object.assign(student, {
        canDelete: !student.profileCompleted,
        deleteBlockReason: student.profileCompleted
          ? 'Only incomplete student accounts can be deleted'
          : null,
      }),
    );
  }

  async createBatch(dto: CreateBatchDto): Promise<Batch> {
    const year = normalizeBatchYear(dto.year);
    const existing = await this.batchRepo.findOne({ where: { year } });
    if (existing) {
      throw new ConflictException(`Batch ${year} already exists`);
    }

    const sections = this.normalizeBatchSections(
      year,
      dto.sectionCount,
      dto.sections ?? [],
    );

    const batch = this.batchRepo.create({
      year,
      sectionCount: dto.sectionCount,
      sections,
    });
    return this.batchRepo.save(batch);
  }

  async getAllBatches(): Promise<
    Array<
      Batch & {
        semesterCount: number;
        studentCount: number;
        canDelete: boolean;
        deleteBlockReason: string | null;
      }
    >
  > {
    const batches = await this.batchRepo.find({
      order: { year: 'DESC', createdAt: 'DESC' },
    });

    return Promise.all(
      batches.map(async (batch) => {
        const [semesterCount, studentCount] = await Promise.all([
          this.semesterRepo.count({ where: { batchYear: batch.year } }),
          this.studentRepo.count({
            where: { batchYear: In(batchYearVariants(batch.year)) },
          }),
        ]);

        const blockers = [
          ...(semesterCount > 0
            ? [buildCountLabel(semesterCount, 'semester')]
            : []),
          ...(studentCount > 0
            ? [buildCountLabel(studentCount, 'student')]
            : []),
        ];

        return Object.assign(batch, {
          semesterCount,
          studentCount,
          canDelete: blockers.length === 0,
          deleteBlockReason: blockers.length
            ? `Delete is available only when a batch has no linked ${blockers.join(' or ')}.`
            : null,
        });
      }),
    );
  }

  async deleteBatch(id: string): Promise<void> {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const [semesterCount, studentCount] = await Promise.all([
      this.semesterRepo.count({ where: { batchYear: batch.year } }),
      this.studentRepo.count({
        where: { batchYear: In(batchYearVariants(batch.year)) },
      }),
    ]);

    if (semesterCount > 0 || studentCount > 0) {
      const blockers = [
        ...(semesterCount > 0
          ? [buildCountLabel(semesterCount, 'semester')]
          : []),
        ...(studentCount > 0
          ? [buildCountLabel(studentCount, 'student')]
          : []),
      ];
      throw new BadRequestException(
        `Cannot delete batch ${batch.year} because it still has ${blockers.join(' and ')}.`,
      );
    }

    await this.batchRepo.delete(id);
  }

  async createSemester(dto: CreateSemesterDto) {
    const normalizedBatchYear = normalizeBatchYear(dto.batchYear);
    const batch = await this.batchRepo.findOne({
      where: { year: normalizedBatchYear },
    });
    if (!batch) {
      throw new NotFoundException(
        `Batch ${normalizedBatchYear} must be created first`,
      );
    }

    if (!dto.startDate) {
      throw new BadRequestException('Start date is required');
    }

    const existingSemesters = await this.semesterRepo.find({
      where: { batchYear: normalizedBatchYear },
      order: { name: 'ASC' },
    });
    const expectedName = this.getExpectedSemesterName(existingSemesters);
    if (!expectedName) {
      throw new BadRequestException(
        `All semesters have already been created for batch ${batch.year}`,
      );
    }
    if (dto.name !== expectedName) {
      throw new BadRequestException(
        `${expectedName.replace('_', ' ')} must be created next for batch ${batch.year}`,
      );
    }

    const semesterName = dto.name as SemesterName;

    const existing = await this.semesterRepo.findOne({
      where: { name: semesterName, batchYear: normalizedBatchYear },
    });
    if (existing)
      throw new ConflictException('Semester already exists for this batch');

    const startDate = parseDateInput(dto.startDate);
    this.validateSemesterTimeline(existingSemesters, semesterName, startDate);

    const semester = this.semesterRepo.create({
      name: semesterName,
      batchYear: normalizedBatchYear,
      startDate,
      endDate: null,
    });
    const savedSemester = await this.semesterRepo.save(semester);
    await this.syncBatchCurrentSemester(normalizedBatchYear);
    return savedSemester;
  }

  async getAllSemesters(): Promise<
    Array<
      Semester & {
        courseCount: number;
        canDelete: boolean;
        deleteBlockReason: string | null;
      }
    >
  > {
    const semesters = await this.semesterRepo.find({
      order: { batchYear: 'DESC', name: 'ASC' },
    });

    return Promise.all(
      semesters.map(async (semester) => {
        const courseCount = await this.courseRepo.count({
          where: { semesterId: semester.id },
        });

        return Object.assign(semester, {
          courseCount,
          canDelete: courseCount === 0,
          deleteBlockReason:
            courseCount > 0
              ? 'Delete is available only when this semester has no courses.'
              : null,
        });
      }),
    );
  }

  async resetTeacherCredentials(
    teacherId: string,
  ): Promise<{ teacher: Teacher; plainPassword: string }> {
    const teacher = await this.teacherRepo.findOne({
      where: { id: teacherId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 12);
    await this.userRepo.update(teacher.userId, {
      password: hashedPassword,
      passwordChangeSuggested: true,
      isActive: true,
    });
    return { teacher, plainPassword };
  }

  async resetStudentCredentials(
    studentId: string,
  ): Promise<{ student: Student; plainPassword: string }> {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('Student not found');

    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 12);
    await this.userRepo.update(student.userId, {
      password: hashedPassword,
      passwordChangeSuggested: true,
      isFirstLogin: true,
      isActive: true,
    });
    return { student, plainPassword };
  }

  async deleteTeacher(teacherId: string): Promise<void> {
    const teacher = await this.teacherRepo.findOne({
      where: { id: teacherId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const today = new Date().toISOString().slice(0, 10);
    const assignedCourses = await this.courseRepo
      .createQueryBuilder('course')
      .innerJoinAndSelect('course.teachers', 'assignedTeacher')
      .innerJoinAndSelect('course.semester', 'semester')
      .where('assignedTeacher.id = :teacherId', { teacherId })
      .andWhere('course.isActive = true')
      .getMany();

    const blockingCourses = assignedCourses.filter(
      (course) =>
        course.semester?.isCurrent ||
        (course.semester?.startDate &&
          new Date(course.semester.startDate).toISOString().slice(0, 10) > today),
    );

    if (blockingCourses.length) {
      throw new BadRequestException(
        'Cannot delete a teacher assigned to a current or upcoming course',
      );
    }

    for (const course of assignedCourses) {
      course.teachers = course.teachers.filter(
        (assignedTeacher) => assignedTeacher.id !== teacher.id,
      );
      await this.courseRepo.save(course);
    }

    await this.userRepo.delete(teacher.userId);
  }

  async deleteStudent(studentId: string): Promise<void> {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (student.profileCompleted) {
      throw new BadRequestException(
        'Only incomplete student accounts can be deleted',
      );
    }
    await this.userRepo.delete(student.userId);
  }

  async updateSemester(
    id: string,
    dto: UpdateSemesterStartDateDto,
  ): Promise<Semester> {
    const semester = await this.semesterRepo.findOne({ where: { id } });
    if (!semester) throw new NotFoundException('Semester not found');

    const startDate = parseDateInput(dto.startDate);
    const semesters = await this.semesterRepo.find({
      where: { batchYear: semester.batchYear },
      order: { name: 'ASC' },
    });

    this.validateSemesterTimeline(semesters, semester.name, startDate, semester.id);
    semester.startDate = startDate;
    semester.endDate = null;

    const savedSemester = await this.semesterRepo.save(semester);
    await this.syncBatchCurrentSemester(semester.batchYear);
    return savedSemester;
  }

  async setCurrentSemester(id: string): Promise<Semester> {
    const semester = await this.semesterRepo.findOne({ where: { id } });
    if (!semester) throw new NotFoundException('Semester not found');

    if (
      !semester.startDate ||
      startOfUtcDay(new Date(semester.startDate)) > startOfUtcDay(new Date())
    ) {
      throw new BadRequestException(
        'A semester can only become active after its start date',
      );
    }

    await this.semesterRepo
      .createQueryBuilder()
      .update(Semester)
      .set({ isCurrent: false })
      .where('batchYear = :batchYear', { batchYear: semester.batchYear })
      .execute();

    semester.isCurrent = true;
    return this.semesterRepo.save(semester);
  }

  async deleteSemester(id: string): Promise<void> {
    const semester = await this.semesterRepo.findOne({
      where: { id },
      relations: ['courses'],
    });
    if (!semester) throw new NotFoundException('Semester not found');
    if (semester.courses?.length) {
      throw new BadRequestException(
        'Cannot delete semester with existing courses',
      );
    }
    await this.semesterRepo.delete(id);
    await this.syncBatchCurrentSemester(semester.batchYear);
  }
}
