import {
  Injectable, BadRequestException, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/entities/user.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { TempJudge } from '../users/entities/temp-judge.entity';
import { Semester } from '../courses/entities/semester.entity';
import { UserRole } from '../../common/enums/role.enum';
import {
  CreateTeacherDto, CreateStudentsBulkDto, CreateTempJudgeDto,
  ExtendTempJudgeDto, CorrectStudentDto, CorrectTeacherDto, CreateStudentDto,
} from './dto/office.dto';

function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function parseStudentId(id: string): { batchYear: string; deptCode: string; rollNumber: string } {
  // Format: 2107070 → batch=21, dept=07, roll=070
  const str = id.trim();
  if (str.length !== 7) throw new BadRequestException(`Invalid student ID format: ${id}`);
  return {
    batchYear: str.substring(0, 2),
    deptCode: str.substring(2, 4),
    rollNumber: str.substring(4, 7),
  };
}

@Injectable()
export class OfficeService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(TempJudge) private judgeRepo: Repository<TempJudge>,
    @InjectRepository(Semester) private semesterRepo: Repository<Semester>,
    private readonly dataSource: DataSource,
  ) {}

  // ────────────────────────────────────────────────────────
  // TEACHER MANAGEMENT
  // ────────────────────────────────────────────────────────

  async createTeacher(dto: CreateTeacherDto): Promise<{ teacher: Teacher; plainPassword: string }> {
    const existing = await this.userRepo.findOne({ where: { username: dto.teacherId } });
    if (existing) throw new ConflictException(`Teacher ID ${dto.teacherId} already exists`);

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
        phone: dto.phone ?? null,
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

  async createStudent(dto: CreateStudentDto): Promise<{ student: Student; plainPassword: string }> {
    const existing = await this.userRepo.findOne({ where: { username: dto.studentId } });
    if (existing) throw new ConflictException(`Student ID ${dto.studentId} already exists`);

    const parsed = parseStudentId(dto.studentId);
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
        batchYear: parsed.batchYear,
        deptCode: parsed.deptCode,
        rollNumber: parsed.rollNumber,
        fullName: dto.fullName ?? null,
        profileCompleted: false,
        userId: savedUser.id,
      });
      const savedStudent = await queryRunner.manager.save(student);
      await queryRunner.commitTransaction();
      return { student: savedStudent, plainPassword };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async createStudentsBulk(dto: CreateStudentsBulkDto): Promise<{ credentials: { username: string; password: string; name: string }[] }> {
    const from = parseInt(dto.fromStudentId, 10);
    const to = parseInt(dto.toStudentId, 10);
    if (isNaN(from) || isNaN(to) || from > to) {
      throw new BadRequestException('Invalid student ID range');
    }
    if (to - from > 200) {
      throw new BadRequestException('Cannot create more than 200 students at once');
    }

    const credentials: { username: string; password: string; name: string }[] = [];
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (let idNum = from; idNum <= to; idNum++) {
        const studentId = idNum.toString().padStart(7, '0');
        // Skip if already exists
        const exists = await queryRunner.manager.findOne(User, { where: { username: studentId } });
        if (exists) continue;

        const parsed = parseStudentId(studentId);
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
          batchYear: parsed.batchYear,
          deptCode: parsed.deptCode,
          rollNumber: parsed.rollNumber,
          profileCompleted: false,
          userId: savedUser.id,
        });
        await queryRunner.manager.save(student);
        credentials.push({ username: studentId, password: plainPassword, name: `Student ${studentId}` });
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

  // ────────────────────────────────────────────────────────
  // TEMP JUDGE MANAGEMENT
  // ────────────────────────────────────────────────────────

  async createTempJudge(dto: CreateTempJudgeDto, officeUserId: string): Promise<{ judge: TempJudge; plainPassword: string }> {
    const count = await this.judgeRepo.count();
    const judgeId = `TJ-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

    const plainPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

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
        expiresAt: new Date(dto.accessUntil),
        passwordChangeSuggested: false,
      });
      const savedUser = await queryRunner.manager.save(user);

      const judge = queryRunner.manager.create(TempJudge, {
        judgeId,
        fullName: dto.fullName,
        accessFrom: new Date(dto.accessFrom),
        accessUntil: new Date(dto.accessUntil),
        notes: dto.notes ?? null,
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

  async extendTempJudge(judgeId: string, dto: ExtendTempJudgeDto): Promise<TempJudge> {
    const judge = await this.judgeRepo.findOne({ where: { id: judgeId } });
    if (!judge) throw new NotFoundException('Judge not found');

    judge.accessUntil = new Date(dto.newAccessUntil);
    await this.userRepo.update(judge.userId, { expiresAt: new Date(dto.newAccessUntil) });
    return this.judgeRepo.save(judge);
  }

  async getAllJudges(): Promise<TempJudge[]> {
    return this.judgeRepo.find({ order: { createdAt: 'DESC' } });
  }

  // ────────────────────────────────────────────────────────
  // OFFICE CORRECTIONS
  // ────────────────────────────────────────────────────────

  async correctStudentInfo(dto: CorrectStudentDto): Promise<Student> {
    const student = await this.studentRepo.findOne({ where: { userId: dto.studentUserId } });
    if (!student) throw new NotFoundException('Student not found');

    if (dto.fullName) student.fullName = dto.fullName;
    if (dto.dateOfBirth) student.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.email) student.email = dto.email;
    return this.studentRepo.save(student);
  }

  async correctTeacherInfo(dto: CorrectTeacherDto): Promise<Teacher> {
    const teacher = await this.teacherRepo.findOne({ where: { userId: dto.teacherUserId } });
    if (!teacher) throw new NotFoundException('Teacher not found');

    if (dto.fullName) teacher.fullName = dto.fullName;
    if (dto.email) teacher.email = dto.email;
    return this.teacherRepo.save(teacher);
  }

  async toggleUserActive(userId: string, isActive: boolean): Promise<void> {
    await this.userRepo.update(userId, { isActive });
  }

  // ────────────────────────────────────────────────────────
  // DASHBOARD DATA
  // ────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [totalTeachers, totalStudents, totalJudges] = await Promise.all([
      this.teacherRepo.count(),
      this.studentRepo.count(),
      this.judgeRepo.count(),
    ]);
    return { totalTeachers, totalStudents, totalJudges };
  }

  async getAllTeachers(): Promise<Teacher[]> {
    return this.teacherRepo.find({ order: { designation: 'ASC', fullName: 'ASC' } });
  }

  async getAllStudents(batchYear?: string): Promise<Student[]> {
    const where = batchYear ? { batchYear } : {};
    return this.studentRepo.find({ where, order: { studentId: 'ASC' } });
  }

  async createSemester(dto: any) {
    const existing = await this.semesterRepo.findOne({
      where: { name: dto.name, batchYear: dto.batchYear },
    });
    if (existing) throw new ConflictException('Semester already exists for this batch');

    const semester = this.semesterRepo.create({
      name: dto.name,
      batchYear: dto.batchYear,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
    });
    return this.semesterRepo.save(semester);
  }

  async getAllSemesters() {
    return this.semesterRepo.find({ order: { batchYear: 'DESC', name: 'ASC' } });
  }
}
