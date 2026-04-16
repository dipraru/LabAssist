import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Course, CourseType } from './entities/course.entity';
import { Semester } from './entities/semester.entity';
import { Enrollment } from './entities/enrollment.entity';
import { LabSchedule } from './entities/lab-schedule.entity';
import { LectureSheet } from './entities/lecture-sheet.entity';
import { CoursePost, CoursePostType } from './entities/course-post.entity';
import { CoursePostComment } from './entities/course-post-comment.entity';
import { LabClass } from './entities/lab-class.entity';
import {
  LabAttendanceRecord,
  LabClassSection,
  LabClassSectionStatus,
} from './entities/lab-class-section.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { Batch } from '../office/entities/batch.entity';
import { UserRole } from '../../common/enums/role.enum';
import {
  ManualVerdict,
  SubmissionStatus,
} from '../../common/enums';
import {
  CreateCourseDto,
  UpdateCourseDto,
  EnrollStudentsDto,
  AddTeacherToCourseDto,
  CreateScheduleDto,
  CreateLectureSheetDto,
  UpdateLectureSheetDto,
  CreateCoursePostDto,
  CreateCoursePostCommentDto,
  CreateLabClassDto,
  TakeLabClassAttendanceDto,
  UpdateLabClassSectionScheduleDto,
} from './dto/courses.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { StorageService } from '../storage/storage.service';
import { Assignment } from '../assignments/entities/assignment.entity';
import { AssignmentSubmission } from '../assignments/entities/assignment-submission.entity';
import { LabTest } from '../lab-tests/entities/lab-test.entity';
import { LabSubmission } from '../lab-tests/entities/lab-submission.entity';
import { CourseReportPdfService } from './course-report-pdf.service';

function batchYearVariants(batchYear: string): string[] {
  const digits = batchYear.replace(/\D/g, '');
  if (digits.length === 4) return [digits, digits.slice(2)];
  if (digits.length === 2) return [digits, `20${digits}`];
  return [batchYear];
}

function isValidTimeRange(startTime: string, endTime: string): boolean {
  return startTime < endTime;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function normalizeSectionName(sectionName?: string | null): string {
  return sectionName?.trim() || 'All Students';
}

function compareSectionNames(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function nextOccurrenceDate(dayName: string, fromDate: Date): Date {
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const targetDay = days.findIndex((day) => day === dayName);
  const current = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
  );

  if (targetDay < 0) {
    return current;
  }

  const offset = (targetDay - current.getDay() + 7) % 7;
  current.setDate(current.getDate() + offset);
  return current;
}

function parseDateStringAsLocalDate(value: string): Date {
  const [yearText = '0', monthText = '1', dayText = '1'] = value.split('-');
  return new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
}

function combineDateAndTime(dateValue: Date | null | undefined, timeValue: string | null | undefined): Date | null {
  if (!dateValue || !timeValue) return null;

  const [hoursText = '0', minutesText = '0'] = String(timeValue).split(':');
  const result = new Date(dateValue);
  result.setHours(Number(hoursText), Number(minutesText), 0, 0);
  return result;
}

function studentIdFallsInsideSection(
  studentId: string,
  fromStudentId: string,
  toStudentId: string,
): boolean {
  const current = Number(studentId);
  const from = Number(fromStudentId);
  const to = Number(toStudentId);

  if (
    !Number.isFinite(current) ||
    !Number.isFinite(from) ||
    !Number.isFinite(to)
  ) {
    return false;
  }

  return current >= Math.min(from, to) && current <= Math.max(from, to);
}

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Semester) private semesterRepo: Repository<Semester>,
    @InjectRepository(Enrollment)
    private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(LabSchedule)
    private scheduleRepo: Repository<LabSchedule>,
    @InjectRepository(LabClass)
    private labClassRepo: Repository<LabClass>,
    @InjectRepository(LabClassSection)
    private labClassSectionRepo: Repository<LabClassSection>,
    @InjectRepository(LectureSheet)
    private lectureSheetRepo: Repository<LectureSheet>,
    @InjectRepository(CoursePost)
    private coursePostRepo: Repository<CoursePost>,
    @InjectRepository(CoursePostComment)
    private coursePostCommentRepo: Repository<CoursePostComment>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(Batch) private batchRepo: Repository<Batch>,
    @InjectRepository(Assignment)
    private assignmentRepo: Repository<Assignment>,
    @InjectRepository(AssignmentSubmission)
    private assignmentSubmissionRepo: Repository<AssignmentSubmission>,
    @InjectRepository(LabTest) private labTestRepo: Repository<LabTest>,
    @InjectRepository(LabSubmission)
    private labSubmissionRepo: Repository<LabSubmission>,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
    private readonly courseReportPdfService: CourseReportPdfService,
  ) {}

  private isCourseArchived(course: Pick<Course, 'semester'>): boolean {
    if (course.semester?.isCurrent) {
      return false;
    }

    if (!course.semester?.endDate) {
      return false;
    }

    const endDate = new Date(course.semester.endDate);
    const endDay = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
    );

    return endDay < startOfToday();
  }

  private async getTeacherWithCourseAccess(
    courseId: string,
    teacherUserId: string,
  ): Promise<{ teacher: Teacher; course: Course }> {
    const teacher = await this.teacherRepo.findOne({
      where: { userId: teacherUserId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const course = await this.courseRepo.findOne({
      where: { id: courseId, isActive: true },
      relations: [
        'teachers',
        'semester',
        'schedules',
        'enrollments',
        'enrollments.student',
      ],
    });
    if (!course) throw new NotFoundException('Course not found');

    const isAssigned = course.teachers.some((item) => item.id === teacher.id);
    if (!isAssigned) {
      throw new ForbiddenException('You are not assigned to this course');
    }

    return { teacher, course };
  }

  private async getStudentWithCourseAccess(
    courseId: string,
    studentUserId: string,
  ): Promise<{
    student: Student;
    course: Course & { batchSections: any[] };
    sectionName: string;
  }> {
    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');

    const course = await this.courseRepo.findOne({
      where: { id: courseId, isActive: true },
      relations: ['semester', 'teachers', 'schedules'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const enrollment = await this.enrollmentRepo.findOne({
      where: { courseId, studentId: student.id, isActive: true },
    });
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this course');
    }

    const batchSections = await this.getCourseBatchSections(course);
    const sectionName =
      batchSections.find((section) =>
        studentIdFallsInsideSection(
          student.studentId,
          section.fromStudentId,
          section.toStudentId,
        ),
      )?.name ?? 'All Students';

    return {
      student,
      course: Object.assign(course, {
        batchSections: batchSections.sort((left, right) =>
          compareSectionNames(left.name, right.name),
        ),
      }),
      sectionName,
    };
  }

  private async getCourseBatchSections(course: Course) {
    if (!course.semester?.batchYear) {
      return [];
    }

    const batch = await this.batchRepo.findOne({
      where: { year: course.semester.batchYear },
    });

    return batch?.sections ?? [];
  }

  private async getStudentsForCourseSection(
    course: Course,
    sectionName: string,
  ): Promise<Student[]> {
    const allStudents = (course.enrollments ?? [])
      .filter((enrollment) => enrollment.isActive !== false)
      .map((enrollment) => enrollment.student)
      .filter((student): student is Student => Boolean(student));

    const normalizedSectionName = normalizeSectionName(sectionName);
    if (normalizedSectionName === 'All Students') {
      return allStudents;
    }

    const batchSections = await this.getCourseBatchSections(course);
    const batchSection = batchSections.find(
      (item) => item.name === normalizedSectionName,
    );

    if (!batchSection) {
      return [];
    }

    return allStudents.filter((student) =>
      studentIdFallsInsideSection(
        student.studentId,
        batchSection.fromStudentId,
        batchSection.toStudentId,
      ),
    );
  }

  private getScheduleForSection(course: Course, sectionName: string) {
    const normalizedSectionName = normalizeSectionName(sectionName);
    return (course.schedules ?? []).find(
      (schedule) =>
        normalizeSectionName(schedule.sectionName) === normalizedSectionName,
    );
  }

  private async validateLectureSheetPlacement(
    courseId: string,
    labClassId?: string | null,
    sectionName?: string | null,
  ): Promise<LabClass | null> {
    if (!labClassId && sectionName) {
      throw new BadRequestException(
        'Section-specific material must be attached to a lab class',
      );
    }

    if (!labClassId) {
      return null;
    }

    const labClass = await this.labClassRepo.findOne({
      where: { id: labClassId },
      relations: ['sections'],
    });
    if (!labClass || labClass.courseId !== courseId) {
      throw new BadRequestException('Lab class not found for this course');
    }

    if (
      sectionName &&
      !labClass.sections.some(
        (section) => section.sectionName === normalizeSectionName(sectionName),
      )
    ) {
      throw new BadRequestException('Invalid section for the selected lab class');
    }

    return labClass;
  }

  private async validateCourseSetup(
    semester: Semester,
    schedules: CreateCourseDto['schedules'] | UpdateCourseDto['schedules'],
    excludedStudentIds: string[] = [],
  ) {
    const batch = await this.batchRepo.findOne({
      where: { year: semester.batchYear },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found for the selected semester');
    }

    const expectedSections =
      batch.sectionCount > 1
        ? batch.sections.map((section) => section.name)
        : [batch.sections[0]?.name ?? 'All Students'];

    if (!schedules || schedules.length !== expectedSections.length) {
      throw new BadRequestException(
        `Expected schedule entries for ${expectedSections.length} section(s)`,
      );
    }

    const scheduleNames = new Set<string>();
    for (const schedule of schedules) {
      if (!expectedSections.includes(schedule.sectionName)) {
        throw new BadRequestException(
          `Invalid section '${schedule.sectionName}' for batch ${batch.year}`,
        );
      }
      if (scheduleNames.has(schedule.sectionName)) {
        throw new BadRequestException(
          `Duplicate schedule found for section '${schedule.sectionName}'`,
        );
      }
      scheduleNames.add(schedule.sectionName);

      if (!isValidTimeRange(schedule.startTime, schedule.endTime)) {
        throw new BadRequestException(
          `End time must be after start time for section '${schedule.sectionName}'`,
        );
      }
    }

    const uniqueExcludedStudentIds = Array.from(
      new Set(excludedStudentIds.map((studentId) => studentId.trim())),
    );
    let excludedStudents: Student[] = [];
    if (uniqueExcludedStudentIds.length) {
      excludedStudents = await this.studentRepo.find({
        where: {
          studentId: In(uniqueExcludedStudentIds),
          batchYear: In(batchYearVariants(semester.batchYear)),
        },
      });

      if (excludedStudents.length !== uniqueExcludedStudentIds.length) {
        throw new BadRequestException(
          'Every excluded student ID must belong to the selected batch',
        );
      }
    }

    return {
      batch,
      expectedSections,
      excludedStudents,
      excludedStudentIds: uniqueExcludedStudentIds,
    };
  }

  async createCourse(dto: CreateCourseDto): Promise<Course> {
    const semester = await this.semesterRepo.findOne({
      where: { id: dto.semesterId },
    });
    if (!semester) throw new NotFoundException('Semester not found');

    const teachers = await this.teacherRepo.find({
      where: { id: In(dto.teacherIds) },
    });
    if (teachers.length !== dto.teacherIds.length) {
      throw new BadRequestException('One or more assigned teachers were not found');
    }

    const { excludedStudents } = await this.validateCourseSetup(
      semester,
      dto.schedules,
      dto.excludedStudentIds ?? [],
    );

    const excludedStudentIdSet = new Set(
      excludedStudents.map((student) => student.studentId),
    );

    const course = this.courseRepo.create({
      courseCode: dto.courseCode,
      title: dto.title,
      type: dto.type,
      creditHours: dto.creditHours ?? 3,
      description: dto.description ?? null,
      semesterId: dto.semesterId,
      teachers,
    });
    const savedCourse = await this.courseRepo.save(course);

    const students = await this.studentRepo.find({
      where: { batchYear: In(batchYearVariants(semester.batchYear)) },
    });
    if (students.length) {
      const enrollments = students
        .filter((student) => !excludedStudentIdSet.has(student.studentId))
        .map((student) =>
        this.enrollmentRepo.create({
          courseId: savedCourse.id,
          studentId: student.id,
          isActive: true,
        }),
        );
      if (enrollments.length) {
        await this.enrollmentRepo.save(enrollments);
      }
    }

    const schedules = dto.schedules.map((schedule) =>
      this.scheduleRepo.create({
        courseId: savedCourse.id,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        roomNumber: null,
        batchYear: semester.batchYear,
        sectionName: schedule.sectionName,
      }),
    );
    await this.scheduleRepo.save(schedules);

    return this.getCourseById(savedCourse.id);
  }

  async updateCourse(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.courseRepo.findOne({
      where: { id },
      relations: ['teachers', 'semester', 'schedules'],
    });
    if (!course) throw new NotFoundException('Course not found');

    let semester = course.semester;
    if (!semester) {
      const fallbackSemester = await this.semesterRepo.findOne({
        where: { id: course.semesterId },
      });
      if (!fallbackSemester) throw new NotFoundException('Semester not found');
      semester = fallbackSemester;
    }

    if (dto.courseCode !== undefined) course.courseCode = dto.courseCode;
    if (dto.title !== undefined) course.title = dto.title;
    if (dto.type !== undefined) course.type = dto.type;
    if (dto.creditHours !== undefined) course.creditHours = dto.creditHours;
    if (dto.description !== undefined)
      course.description = dto.description ?? null;
    if (dto.teacherIds !== undefined) {
      const teachers = await this.teacherRepo.find({
        where: { id: In(dto.teacherIds) },
      });
      if (teachers.length !== dto.teacherIds.length) {
        throw new BadRequestException(
          'One or more assigned teachers were not found',
        );
      }
      course.teachers = teachers;
    }

    await this.courseRepo.save(course);

    if (dto.schedules !== undefined || dto.excludedStudentIds !== undefined) {
      const schedules = dto.schedules ?? course.schedules.map((schedule) => ({
        sectionName: schedule.sectionName ?? 'All Students',
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      }));
      const excludedStudentIds = dto.excludedStudentIds ?? [];

      const { excludedStudents } = await this.validateCourseSetup(
        semester,
        schedules,
        excludedStudentIds,
      );

      await this.scheduleRepo.delete({ courseId: course.id });
      await this.scheduleRepo.save(
        schedules.map((schedule) =>
          this.scheduleRepo.create({
            courseId: course.id,
            dayOfWeek: schedule.dayOfWeek,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            roomNumber: null,
            batchYear: semester.batchYear,
            sectionName: schedule.sectionName,
          }),
        ),
      );

      const batchStudents = await this.studentRepo.find({
        where: { batchYear: In(batchYearVariants(semester.batchYear)) },
      });
      const excludedStudentIdSet = new Set(
        excludedStudents.map((student) => student.studentId),
      );
      const allowedStudentIds = new Set(
        batchStudents
          .filter((student) => !excludedStudentIdSet.has(student.studentId))
          .map((student) => student.id),
      );

      const currentEnrollments = await this.enrollmentRepo.find({
        where: { courseId: course.id },
      });

      const toDelete = currentEnrollments.filter(
        (enrollment) => !allowedStudentIds.has(enrollment.studentId),
      );
      if (toDelete.length) {
        await this.enrollmentRepo.remove(toDelete);
      }

      const enrolledStudentIdSet = new Set(
        currentEnrollments
          .filter((enrollment) => allowedStudentIds.has(enrollment.studentId))
          .map((enrollment) => enrollment.studentId),
      );
      const toCreate = batchStudents
        .filter(
          (student) =>
            allowedStudentIds.has(student.id) &&
            !enrolledStudentIdSet.has(student.id),
        )
        .map((student) =>
          this.enrollmentRepo.create({
            courseId: course.id,
            studentId: student.id,
            isActive: true,
          }),
        );
      if (toCreate.length) {
        await this.enrollmentRepo.save(toCreate);
      }
    }

    return this.getCourseById(id);
  }

  async deleteCourse(id: string): Promise<void> {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    await this.courseRepo.remove(course);
  }

  async getCourseById(id: string): Promise<Course> {
    const course = await this.courseRepo.findOne({
      where: { id },
      relations: ['teachers', 'semester', 'schedules', 'enrollments', 'enrollments.student'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const batchSections = (await this.getCourseBatchSections(course)).sort(
      (left, right) => compareSectionNames(left.name, right.name),
    );
    return Object.assign(course, { batchSections });
  }

  async getCoursesByTeacher(teacherUserId: string): Promise<Course[]> {
    const teacher = await this.teacherRepo.findOne({
      where: { userId: teacherUserId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    const courses = await this.courseRepo
      .createQueryBuilder('course')
      .innerJoin('course.teachers', 'assignedTeacher', 'assignedTeacher.id = :tid', {
        tid: teacher.id,
      })
      .leftJoinAndSelect('course.teachers', 'teacher')
      .leftJoinAndSelect('course.semester', 'semester')
      .leftJoinAndSelect('course.schedules', 'schedules')
      .where('course.isActive = true')
      .getMany();

    return Promise.all(
      courses.map(async (course) =>
        Object.assign(course, {
          batchSections: (await this.getCourseBatchSections(course)).sort(
            (left, right) => compareSectionNames(left.name, right.name),
          ),
        }),
      ),
    );
  }

  async getCoursesByStudent(studentUserId: string): Promise<Course[]> {
    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');
    const courses = await this.courseRepo
      .createQueryBuilder('course')
      .innerJoin(
        'course.enrollments',
        'enrollment',
        'enrollment.studentId = :sid AND enrollment.isActive = true',
        { sid: student.id },
      )
      .leftJoinAndSelect('course.teachers', 'teacher')
      .leftJoinAndSelect('course.semester', 'semester')
      .leftJoinAndSelect('course.schedules', 'schedules')
      .where('course.isActive = true')
      .getMany();

    return Promise.all(
      courses.map(async (course) =>
        Object.assign(course, {
          batchSections: (await this.getCourseBatchSections(course)).sort(
            (left, right) => compareSectionNames(left.name, right.name),
          ),
        }),
      ),
    );
  }

  async enrollStudents(
    dto: EnrollStudentsDto,
    requesterId: string,
  ): Promise<{ enrolled: number; skipped: number }> {
    let students: Student[] = [];

    if (dto.batchYear) {
      students = await this.studentRepo.find({
        where: { batchYear: dto.batchYear },
      });
    } else if (dto.studentUserIds?.length) {
      students = await this.studentRepo.find({
        where: { userId: In(dto.studentUserIds) },
      });
    }

    let enrolled = 0;
    let skipped = 0;

    for (const student of students) {
      const exists = await this.enrollmentRepo.findOne({
        where: { courseId: dto.courseId, studentId: student.id },
      });
      if (exists) {
        skipped++;
        continue;
      }

      await this.enrollmentRepo.save(
        this.enrollmentRepo.create({
          courseId: dto.courseId,
          studentId: student.id,
        }),
      );
      enrolled++;
    }
    return { enrolled, skipped };
  }

  async removeEnrollment(
    courseId: string,
    studentUserId: string,
  ): Promise<void> {
    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');
    await this.enrollmentRepo.delete({ courseId, studentId: student.id });
  }

  async addTeacherToCourse(dto: AddTeacherToCourseDto): Promise<Course> {
    const course = await this.courseRepo.findOne({
      where: { id: dto.courseId },
      relations: ['teachers'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const teacher = await this.teacherRepo.findOne({
      where: { id: dto.teacherId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const already = course.teachers.find((t) => t.id === teacher.id);
    if (!already) {
      course.teachers.push(teacher);
      await this.courseRepo.save(course);
    }
    return course;
  }

  async removeTeacherFromCourse(
    courseId: string,
    teacherId: string,
  ): Promise<void> {
    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: ['teachers'],
    });
    if (!course) throw new NotFoundException('Course not found');
    course.teachers = course.teachers.filter((t) => t.id !== teacherId);
    await this.courseRepo.save(course);
  }

  async createSchedule(dto: CreateScheduleDto): Promise<LabSchedule> {
    const schedule = this.scheduleRepo.create({
      courseId: dto.courseId,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      roomNumber: dto.roomNumber ?? null,
      batchYear: dto.batchYear ?? null,
    });
    return this.scheduleRepo.save(schedule);
  }

  async getSchedules(
    courseId?: string,
    batchYear?: string,
  ): Promise<LabSchedule[]> {
    const query = this.scheduleRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.course', 'course');
    if (courseId) query.andWhere('s.courseId = :courseId', { courseId });
    if (batchYear) query.andWhere('s.batchYear = :batchYear', { batchYear });
    return query.getMany();
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.scheduleRepo.delete(id);
  }

  async createLabClass(
    dto: CreateLabClassDto,
    teacherUserId: string,
  ): Promise<LabClass> {
    if (!dto.courseId) {
      throw new BadRequestException('Course ID is required');
    }

    const courseId = dto.courseId;
    const { teacher, course } = await this.getTeacherWithCourseAccess(
      courseId,
      teacherUserId,
    );

    if (course.type !== CourseType.LAB) {
      throw new BadRequestException(
        'Lab classes can be created only for lab courses',
      );
    }

    if (this.isCourseArchived(course)) {
      throw new BadRequestException(
        'New lab classes cannot be created for ended semesters',
      );
    }

    const existingMax = await this.labClassRepo
      .createQueryBuilder('labClass')
      .select('MAX(labClass.labNumber)', 'max')
      .where('labClass.courseId = :courseId', { courseId })
      .getRawOne<{ max: string | null }>();

    const nextLabNumber = Number(existingMax?.max ?? 0) + 1;
    const normalizedSections = Array.from(
      new Set(
        (course.schedules ?? []).map((schedule) =>
          normalizeSectionName(schedule.sectionName),
        ),
      ),
    ).sort(compareSectionNames);
    if (!normalizedSections.length) {
      normalizedSections.push('All Students');
    }

    const baseDate = dto.classDate ? new Date(dto.classDate) : new Date();

    const labClass = this.labClassRepo.create({
      courseId,
      title: dto.title.trim() || `Lab Class ${nextLabNumber}`,
      description: dto.description?.trim() || null,
      labNumber: nextLabNumber,
      classDate: new Date(baseDate),
      createdById: teacher.id,
      sections: normalizedSections.map((sectionName) =>
        {
          const schedule = this.getScheduleForSection(course, sectionName);
          const scheduledDate = schedule?.dayOfWeek
            ? nextOccurrenceDate(schedule.dayOfWeek, baseDate)
            : new Date(baseDate);

          return this.labClassSectionRepo.create({
            sectionName,
            status: LabClassSectionStatus.PENDING,
            attendanceRecords: [],
            scheduledDate,
            scheduledStartTime: schedule?.startTime ?? null,
            scheduledEndTime: schedule?.endTime ?? null,
            roomNumber: schedule?.roomNumber ?? null,
            attendanceTakenAt: null,
            conductedAt: null,
          });
        },
      ),
    });

    const saved = await this.labClassRepo.save(labClass);
    return this.getLabClassById(courseId, saved.id, teacherUserId);
  }

  async getLabClasses(
    courseId: string,
    teacherUserId: string,
  ): Promise<LabClass[]> {
    await this.getTeacherWithCourseAccess(courseId, teacherUserId);

    const labClasses = await this.labClassRepo.find({
      where: { courseId },
      relations: ['sections'],
      order: { labNumber: 'DESC', createdAt: 'DESC' },
    });

    return labClasses.map((labClass) => ({
      ...labClass,
      sections: [...(labClass.sections ?? [])].sort((left, right) =>
        compareSectionNames(left.sectionName, right.sectionName),
      ),
    }));
  }

  async getLabClassById(
    courseId: string,
    labClassId: string,
    teacherUserId: string,
  ): Promise<LabClass> {
    const labClass = await this.labClassRepo.findOne({
      where: { id: labClassId },
      relations: [
        'sections',
        'course',
        'course.teachers',
        'course.semester',
        'course.schedules',
        'course.enrollments',
        'course.enrollments.student',
      ],
    });
    if (!labClass) {
      throw new NotFoundException('Lab class not found');
    }

    await this.getTeacherWithCourseAccess(courseId, teacherUserId);
    if (labClass.courseId !== courseId) {
      throw new NotFoundException('Lab class not found');
    }
    labClass.course = Object.assign(labClass.course, {
      batchSections: (await this.getCourseBatchSections(labClass.course)).sort(
        (left, right) => compareSectionNames(left.name, right.name),
      ),
    });
    labClass.sections = [...(labClass.sections ?? [])].sort((left, right) =>
      compareSectionNames(left.sectionName, right.sectionName),
    );

    return labClass;
  }

  async getLabClassesForStudent(
    courseId: string,
    studentUserId: string,
  ): Promise<
    Array<
      LabClass & {
        viewerSectionName: string;
        viewerAttendance: {
          status: 'present' | 'absent';
          sectionName: string;
          takenAt: Date | null;
        };
      }
    >
  > {
    const { student, sectionName } = await this.getStudentWithCourseAccess(
      courseId,
      studentUserId,
    );

    const labClasses = await this.labClassRepo.find({
      where: { courseId },
      relations: ['sections'],
      order: { labNumber: 'DESC', createdAt: 'DESC' },
    });

    return labClasses
      .map((labClass) => {
        const sortedSections = [...(labClass.sections ?? [])].sort((left, right) =>
          compareSectionNames(left.sectionName, right.sectionName),
        );
        const viewerSection =
          sortedSections.find(
            (section) => normalizeSectionName(section.sectionName) === sectionName,
          ) ??
          sortedSections.find(
            (section) => normalizeSectionName(section.sectionName) === 'All Students',
          ) ??
          null;

        if (!viewerSection || viewerSection.status !== LabClassSectionStatus.CONDUCTED) {
          return null;
        }

        const attendanceRecord =
          viewerSection.attendanceRecords?.find(
            (record) => record.studentId === student.id,
          ) ?? null;

        return {
          ...labClass,
          sections: sortedSections,
          viewerSectionName: sectionName,
          viewerAttendance: {
            status: attendanceRecord?.isPresent ? 'present' : 'absent',
            sectionName: viewerSection.sectionName,
            takenAt: viewerSection.attendanceTakenAt ?? null,
          },
        };
      })
      .filter(
        (
          labClass,
        ): labClass is LabClass & {
          viewerSectionName: string;
          viewerAttendance: {
            status: 'present' | 'absent';
            sectionName: string;
            takenAt: Date | null;
          };
        } => Boolean(labClass),
      );
  }

  async getLabClassByIdForStudent(
    courseId: string,
    labClassId: string,
    studentUserId: string,
  ): Promise<
    LabClass & {
      course: Course;
      viewerSectionName: string;
      viewerAttendance: {
        status: 'present' | 'absent' | 'not_taken';
        sectionName: string | null;
        takenAt: Date | null;
      };
    }
  > {
    const { course, sectionName, student } = await this.getStudentWithCourseAccess(
      courseId,
      studentUserId,
    );

    const labClass = await this.labClassRepo.findOne({
      where: { id: labClassId },
      relations: ['sections', 'course', 'course.teachers', 'course.semester', 'course.schedules'],
    });
    if (!labClass || labClass.courseId !== courseId) {
      throw new NotFoundException('Lab class not found');
    }

    const viewerSection =
      (labClass.sections ?? []).find(
        (section) => normalizeSectionName(section.sectionName) === sectionName,
      ) ??
      (labClass.sections ?? []).find(
        (section) => normalizeSectionName(section.sectionName) === 'All Students',
      ) ??
      null;
    if (!viewerSection || viewerSection.status !== LabClassSectionStatus.CONDUCTED) {
      throw new NotFoundException('Lab class not found');
    }

    labClass.course = Object.assign(labClass.course, {
      batchSections: course.batchSections,
    });
    labClass.sections = [...(labClass.sections ?? [])].sort((left, right) =>
      compareSectionNames(left.sectionName, right.sectionName),
    );

    const attendanceSection =
      labClass.sections.find(
        (section) => normalizeSectionName(section.sectionName) === normalizeSectionName(viewerSection.sectionName),
      ) ?? null;
    const attendanceRecord =
      attendanceSection?.attendanceRecords?.find(
        (record) => record.studentId === student.id,
      ) ?? null;
    const viewerAttendanceStatus: 'present' | 'absent' | 'not_taken' =
      attendanceSection?.attendanceTakenAt != null
        ? attendanceRecord?.isPresent
          ? 'present'
          : 'absent'
        : 'not_taken';

    return Object.assign(labClass, {
      viewerSectionName: sectionName,
      viewerAttendance: {
        status: viewerAttendanceStatus,
        sectionName: attendanceSection?.sectionName ?? null,
        takenAt: attendanceSection?.attendanceTakenAt ?? null,
      },
    });
  }

  async updateLabClassSectionSchedule(
    courseId: string,
    labClassId: string,
    sectionId: string,
    dto: UpdateLabClassSectionScheduleDto,
    teacherUserId: string,
  ): Promise<LabClassSection> {
    const { course } = await this.getTeacherWithCourseAccess(
      courseId,
      teacherUserId,
    );
    const section = await this.labClassSectionRepo.findOne({
      where: { id: sectionId, labClassId },
      relations: ['labClass'],
    });
    if (!section || section.labClass.courseId !== courseId) {
      throw new NotFoundException('Lab class section not found');
    }

    if (!isValidTimeRange(dto.startTime, dto.endTime)) {
      throw new BadRequestException('End time must be after start time');
    }

    const currentScheduleStart = combineDateAndTime(
      section.scheduledDate,
      section.scheduledStartTime,
    );
    if (currentScheduleStart && currentScheduleStart.getTime() <= Date.now()) {
      throw new BadRequestException(
        'This class has already started, so it can no longer be rescheduled',
      );
    }

    const baseSchedule = this.getScheduleForSection(course, section.sectionName);
    section.scheduledDate = parseDateStringAsLocalDate(dto.scheduledDate);
    section.scheduledStartTime = dto.startTime;
    section.scheduledEndTime = dto.endTime;
    section.roomNumber =
      dto.roomNumber?.trim() || baseSchedule?.roomNumber || null;

    return this.labClassSectionRepo.save(section);
  }

  async takeLabClassAttendance(
    courseId: string,
    labClassId: string,
    sectionId: string,
    dto: TakeLabClassAttendanceDto,
    teacherUserId: string,
  ): Promise<LabClassSection> {
    const section = await this.labClassSectionRepo.findOne({
      where: { id: sectionId, labClassId },
      relations: [
        'labClass',
        'labClass.sections',
        'labClass.course',
        'labClass.course.teachers',
        'labClass.course.semester',
        'labClass.course.enrollments',
        'labClass.course.enrollments.student',
      ],
    });
    if (!section || section.labClass.courseId !== courseId) {
      throw new NotFoundException('Lab class section not found');
    }

    await this.getTeacherWithCourseAccess(courseId, teacherUserId);

    const enrolledStudents = (section.labClass.course.enrollments ?? [])
      .filter((enrollment) => enrollment?.isActive !== false)
      .map((enrollment) => enrollment.student)
      .filter((student): student is Student => Boolean(student));
    const enrolledStudentIds = new Set(
      enrolledStudents.map((student) => student.id),
    );
    const naturalSectionStudentIds = new Set(
      (
        await this.getStudentsForCourseSection(
          section.labClass.course,
          section.sectionName,
        )
      ).map((student) => student.id),
    );
    const seenStudentIds = new Set<string>();
    const presentInOtherSections = new Set(
      (section.labClass.sections ?? [])
        .filter((item) => item.id !== section.id)
        .flatMap((item) =>
          (item.attendanceRecords ?? [])
            .filter((record) => record.isPresent)
            .map((record) => record.studentId),
        ),
    );

    const attendanceRecords: LabAttendanceRecord[] = dto.attendance.map(
      (item) => {
        if (seenStudentIds.has(item.studentId)) {
          throw new BadRequestException('Duplicate student found in attendance');
        }
        seenStudentIds.add(item.studentId);

        if (!enrolledStudentIds.has(item.studentId)) {
          throw new BadRequestException(
            'Attendance contains a student outside this course',
          );
        }

        if (item.isPresent && presentInOtherSections.has(item.studentId)) {
          throw new BadRequestException(
            'A student cannot be present in more than one section for the same lab class',
          );
        }

        return {
          studentId: item.studentId,
          isPresent: item.isPresent,
          addedAsExtra: !naturalSectionStudentIds.has(item.studentId),
        };
      },
    );

    section.attendanceRecords = attendanceRecords;
    section.status = LabClassSectionStatus.CONDUCTED;
    section.attendanceTakenAt = new Date();
    section.conductedAt = new Date();

    return this.labClassSectionRepo.save(section);
  }

  async createLectureSheet(
    dto: CreateLectureSheetDto,
    teacherUserId: string,
    uploadedFiles: Express.Multer.File[] = [],
  ): Promise<LectureSheet> {
    if (!dto.courseId) {
      throw new BadRequestException('Course ID is required');
    }

    const courseId = dto.courseId;
    const { teacher } = await this.getTeacherWithCourseAccess(
      courseId,
      teacherUserId,
    );
    const labClass = await this.validateLectureSheetPlacement(
      courseId,
      dto.labClassId,
      dto.sectionName,
    );
    const uploadedLinks = await Promise.all(
      uploadedFiles.map(async (file) => {
        const stored = await this.storageService.saveBuffer(
          file.buffer,
          file.originalname,
          'materials',
          25 * 1024 * 1024,
        );

        return {
          url: stored.url,
          label: file.originalname,
        };
      }),
    );

    const normalizedLinks = [...(dto.links ?? []), ...uploadedLinks]
      .filter((link) => link?.url)
      .map((link) => ({
        url: link.url.trim(),
        label: link.label?.trim() || undefined,
      }));

    if (!normalizedLinks.length) {
      throw new BadRequestException(
        'Add at least one lecture material link or file',
      );
    }

    const sheet = this.lectureSheetRepo.create({
      courseId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      links: normalizedLinks,
      postedById: teacher?.id ?? null,
      labClassId: labClass?.id ?? null,
      sectionName: dto.sectionName
        ? normalizeSectionName(dto.sectionName)
        : null,
    });
    const saved = await this.lectureSheetRepo.save(sheet);

    // Notify enrolled students
    await this.notifyEnrolledStudents(courseId, {
      type: NotificationType.LECTURE_SHEET_POSTED,
      title: `New Lecture Sheet: ${dto.title}`,
      body: `A new lecture sheet has been posted in your course.`,
      referenceId: saved.id,
      targetPath: `/student/courses/${courseId}/materials/${saved.id}`,
    });

    return saved;
  }

  async getCoursePosts(
    courseId: string,
    user: { id: string; role: UserRole },
  ): Promise<CoursePost[]> {
    await this.resolveCourseActor(courseId, user);

    const posts = await this.coursePostRepo.find({
      where: { courseId },
      relations: ['comments'],
      order: { createdAt: 'DESC' },
    });

    return posts.map((post) => ({
      ...post,
      comments: [...(post.comments ?? [])].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      ),
    }));
  }

  async createCoursePost(
    courseId: string,
    dto: CreateCoursePostDto,
    user: { id: string; role: UserRole },
  ): Promise<CoursePost> {
    const actor = await this.resolveCourseActor(courseId, user);

    let type =
      dto.type ??
      (actor.role === UserRole.TEACHER
        ? CoursePostType.ANNOUNCEMENT
        : CoursePostType.QUESTION);

    if (
      actor.role === UserRole.STUDENT &&
      type === CoursePostType.ANNOUNCEMENT
    ) {
      type = CoursePostType.QUESTION;
    }

    const post = this.coursePostRepo.create({
      courseId,
      type,
      title: dto.title?.trim() || null,
      body: dto.body.trim(),
      postedByUserId: actor.userId,
      postedByRole: actor.role,
      postedByName: actor.displayName,
    });

    const saved = await this.coursePostRepo.save(post);

    await this.notifyUsersAboutCoursePost(saved, actor);

    return this.coursePostRepo.findOneOrFail({
      where: { id: saved.id },
      relations: ['comments'],
    });
  }

  async addCoursePostComment(
    postId: string,
    dto: CreateCoursePostCommentDto,
    user: { id: string; role: UserRole },
  ): Promise<CoursePostComment> {
    const post = await this.coursePostRepo.findOne({
      where: { id: postId },
      relations: ['course'],
    });
    if (!post) throw new NotFoundException('Course post not found');

    const actor = await this.resolveCourseActor(post.courseId, user);

    const comment = this.coursePostCommentRepo.create({
      postId,
      body: dto.body.trim(),
      commentedByUserId: actor.userId,
      commentedByRole: actor.role,
      commentedByName: actor.displayName,
    });

    const saved = await this.coursePostCommentRepo.save(comment);

    if (post.postedByUserId !== actor.userId) {
      try {
        await this.notificationsService.createBulk([post.postedByUserId], {
          type: NotificationType.SYSTEM,
          title: `New comment in ${post.course?.courseCode ?? 'course'}`,
          body: `${actor.displayName} commented on your course post.`,
          referenceId: post.id,
          targetPath:
            post.postedByRole === UserRole.TEACHER
              ? `/teacher/courses/${post.courseId}`
              : `/student/courses/${post.courseId}`,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown notification error';
        this.logger.warn(
          `Failed to notify course post author ${post.postedByUserId}: ${message}`,
        );
      }
    }

    return saved;
  }

  async getLectureSheets(courseId: string): Promise<LectureSheet[]> {
    return this.lectureSheetRepo.find({
      where: { courseId },
      relations: ['labClass'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateLectureSheet(
    id: string,
    dto: UpdateLectureSheetDto,
    teacherUserId: string,
  ): Promise<LectureSheet> {
    const sheet = await this.lectureSheetRepo.findOne({ where: { id } });
    if (!sheet) throw new NotFoundException('Lecture sheet not found');

    await this.assertTeacherCanManageLectureSheet(sheet, teacherUserId);

    if (dto.title !== undefined) sheet.title = dto.title;
    if (dto.description !== undefined)
      sheet.description = dto.description ?? null;
    if (dto.links !== undefined) {
      sheet.links = dto.links.map((link) => ({
        url: link.url,
        label: link.label ?? '',
      }));
    }

    return this.lectureSheetRepo.save(sheet);
  }

  async deleteLectureSheet(
    id: string,
    teacherUserId: string,
  ): Promise<{ deleted: true }> {
    const sheet = await this.lectureSheetRepo.findOne({ where: { id } });
    if (!sheet) throw new NotFoundException('Lecture sheet not found');

    await this.assertTeacherCanManageLectureSheet(sheet, teacherUserId);
    await this.lectureSheetRepo.delete({ id: sheet.id });

    return { deleted: true };
  }

  private async assertTeacherCanManageLectureSheet(
    sheet: LectureSheet,
    teacherUserId: string,
  ) {
    const teacher = await this.teacherRepo.findOne({
      where: { userId: teacherUserId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    if (sheet.postedById && sheet.postedById !== teacher.id) {
      throw new ForbiddenException(
        'You can manage only your own lecture sheets',
      );
    }

    if (!sheet.postedById) {
      const course = await this.courseRepo.findOne({
        where: { id: sheet.courseId },
        relations: ['teachers'],
      });
      const isAssignedTeacher = Boolean(
        course?.teachers?.some((t) => t.id === teacher.id),
      );
      if (!isAssignedTeacher) {
        throw new ForbiddenException('You are not assigned to this course');
      }
    }
  }

  private async notifyEnrolledStudents(
    courseId: string,
    payload: {
      type: NotificationType;
      title: string;
      body: string;
      referenceId: string;
      targetPath?: string;
    },
  ) {
    const enrollments = await this.enrollmentRepo.find({
      where: { courseId, isActive: true },
      relations: ['student', 'student.user'],
    });
    const userIds = Array.from(
      new Set(
        enrollments
          .map((enrollment) => enrollment.student?.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    if (!userIds.length) return;

    try {
      await this.notificationsService.createBulk(userIds, payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown notification error';
      this.logger.warn(
        `Failed to notify enrolled students for course ${courseId}: ${message}`,
      );
    }
  }

  async generateCourseProgressPdf(
    courseId: string,
    teacherUserId: string,
  ): Promise<{ pdf: string; fileName: string }> {
    const { course } = await this.getTeacherWithCourseAccess(courseId, teacherUserId);
    const batchSections = (await this.getCourseBatchSections(course)).sort((left, right) =>
      compareSectionNames(left.name, right.name),
    );
    const courseWithSections = Object.assign(course, { batchSections });
    const students = (course.enrollments ?? [])
      .filter((enrollment) => enrollment.isActive !== false)
      .map((enrollment) => enrollment.student)
      .filter((student): student is Student => Boolean(student))
      .sort((left, right) =>
        left.studentId.localeCompare(right.studentId, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      );

    const now = new Date();

    const labClasses = await this.labClassRepo.find({
      where: { courseId },
      relations: ['sections'],
      order: { labNumber: 'ASC', createdAt: 'ASC' },
    });
    const assignments = await this.assignmentRepo.find({
      where: { courseId },
      order: { createdAt: 'ASC' },
    });
    const assignmentIds = assignments.map((assignment) => assignment.id);
    const assignmentSubmissions = assignmentIds.length
      ? await this.assignmentSubmissionRepo.find({
          where: { assignmentId: In(assignmentIds) },
          relations: ['student'],
          order: { updatedAt: 'DESC' },
        })
      : [];
    const labTests = await this.labTestRepo.find({
      where: { courseId },
      relations: ['problems'],
      order: { startTime: 'ASC', createdAt: 'ASC' } as any,
    });
    const problemIds = labTests.flatMap((labTest) =>
      (labTest.problems ?? []).map((problem: any) => problem.id),
    );
    const labSubmissions = problemIds.length
      ? await this.labSubmissionRepo.find({
          where: { problemId: In(problemIds) },
          relations: ['problem', 'problem.labTest', 'student'],
          order: { updatedAt: 'DESC' },
        })
      : [];

    const attendanceColumns = labClasses
      .filter((labClass) => {
        const labDate = labClass.classDate ? new Date(labClass.classDate) : null;
        return !labDate || labDate <= now;
      })
      .map((labClass) => {
        const values: Record<string, string> = {};

        for (const student of students) {
          const sectionName =
            batchSections.find((section) =>
              studentIdFallsInsideSection(
                student.studentId,
                section.fromStudentId,
                section.toStudentId,
              ),
            )?.name ?? 'All Students';
          const matchingSection =
            (labClass.sections ?? []).find(
              (section) => normalizeSectionName(section.sectionName) === sectionName,
            ) ??
            (labClass.sections ?? []).find(
              (section) => normalizeSectionName(section.sectionName) === 'All Students',
            );
          const attendanceRecord = matchingSection?.attendanceRecords?.find(
            (record) => record.studentId === student.id,
          );
          values[student.studentId] = attendanceRecord
            ? attendanceRecord.isPresent
              ? 'P'
              : 'A'
            : '—';
        }

        return {
          label: `L${labClass.labNumber}`,
          values,
        };
      });

    const assignmentSubmissionMap = new Map<string, AssignmentSubmission>();
    for (const submission of assignmentSubmissions) {
      const key = `${submission.assignmentId}:${submission.studentId}`;
      if (!assignmentSubmissionMap.has(key)) {
        assignmentSubmissionMap.set(key, submission);
      }
    }
    const assignmentColumns = assignments
      .filter((assignment) => assignment.createdAt <= now)
      .map((assignment, index) => {
        const values: Record<string, number | null> = {};
        for (const student of students) {
          const submission = assignmentSubmissionMap.get(`${assignment.id}:${student.id}`);
          values[student.studentId] = submission?.score ?? null;
        }
        return {
          label: `A${index + 1}`,
          maxMarks: Number(assignment.totalMarks ?? 0),
          values,
        };
      });

    const bestLabScores = new Map<string, number>();
    for (const submission of labSubmissions) {
      const key = `${submission.problem?.labTestId}:${submission.problemId}:${submission.studentId}`;
      const marksFromVerdict =
        submission.score != null
          ? Number(submission.score)
          : this.deriveLabSubmissionScore(submission);
      const current = bestLabScores.get(key);
      if (current == null || marksFromVerdict > current) {
        bestLabScores.set(key, marksFromVerdict);
      }
    }
    const labTaskColumns = labTests
      .filter((labTest) => labTest.createdAt <= now)
      .map((labTest, index) => {
        const values: Record<string, number | null> = {};
        for (const student of students) {
          const total = (labTest.problems ?? []).reduce((sum: number, problem: any) => {
            return (
              sum + (bestLabScores.get(`${labTest.id}:${problem.id}:${student.id}`) ?? 0)
            );
          }, 0);
          values[student.studentId] = total > 0 ? Number(total.toFixed(2)) : null;
        }
        const maxMarks =
          Number(labTest.totalMarks ?? 0) ||
          (labTest.problems ?? []).reduce(
            (sum: number, problem: any) => sum + Number(problem.marks ?? 0),
            0,
          );
        return {
          label: `LT${index + 1}`,
          maxMarks,
          values,
        };
      });

    const rows = students.map((student) => {
      const sectionName =
        batchSections.find((section) =>
          studentIdFallsInsideSection(
            student.studentId,
            section.fromStudentId,
            section.toStudentId,
          ),
        )?.name ?? 'All Students';
      const attendanceMarks = attendanceColumns.map(
        (column) => column.values[student.studentId] ?? '—',
      );
      const attendancePresent = attendanceMarks.filter((value) => value === 'P').length;
      const attendanceTotal = attendanceMarks.filter((value) => value !== '—').length;
      const assignmentTotal = assignmentColumns.reduce(
        (sum, column) => sum + Number(column.values[student.studentId] ?? 0),
        0,
      );
      const labTaskTotal = labTaskColumns.reduce(
        (sum, column) => sum + Number(column.values[student.studentId] ?? 0),
        0,
      );

      return {
        studentId: student.studentId,
        name:
          student.fullName ||
          student.user?.username ||
          student.studentId,
        sectionName,
        attendancePresent,
        attendanceTotal,
        assignmentTotal: Number(assignmentTotal.toFixed(2)),
        labTaskTotal: Number(labTaskTotal.toFixed(2)),
      };
    });

    const pdf = await this.courseReportPdfService.generateCourseProgressPdf({
      courseCode: course.courseCode,
      courseTitle: course.title,
      semesterLabel: course.semester?.name?.replace(/_/g, ' ') ?? 'Semester',
      generatedAt: new Date().toLocaleString(),
      rows,
      attendanceColumns,
      assignmentColumns,
      labTaskColumns,
    });

    return {
      pdf,
      fileName: `${course.courseCode}_progress_report.pdf`,
    };
  }

  private deriveLabSubmissionScore(submission: LabSubmission): number {
    if (submission.score != null) {
      return Number(submission.score);
    }

    const accepted =
      submission.manualVerdict === ManualVerdict.ACCEPTED ||
      submission.submissionStatus === SubmissionStatus.ACCEPTED;
    if (!accepted) {
      return 0;
    }

    return Number(submission.problem?.marks ?? 0);
  }

  async getAllCourses(): Promise<Course[]> {
    return this.courseRepo.find({
      relations: ['semester', 'teachers', 'schedules', 'enrollments', 'enrollments.student'],
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getEnrollmentsForCourse(courseId: string) {
    return this.enrollmentRepo.find({
      where: { courseId, isActive: true },
      relations: ['student'],
    });
  }

  private async resolveCourseActor(
    courseId: string,
    user: { id: string; role: UserRole },
  ): Promise<{
    userId: string;
    role: UserRole;
    displayName: string;
    course: Course;
  }> {
    const course = await this.courseRepo.findOne({
      where: { id: courseId, isActive: true },
      relations: ['teachers', 'semester', 'schedules'],
    });
    if (!course) throw new NotFoundException('Course not found');

    if (user.role === UserRole.TEACHER) {
      const teacher = await this.teacherRepo.findOne({
        where: { userId: user.id },
      });
      if (!teacher) throw new NotFoundException('Teacher not found');

      const isAssigned = course.teachers.some((item) => item.id === teacher.id);
      if (!isAssigned) {
        throw new ForbiddenException('You are not assigned to this course');
      }

      return {
        userId: user.id,
        role: user.role,
        displayName: teacher.fullName || teacher.teacherId,
        course,
      };
    }

    if (user.role === UserRole.STUDENT) {
      const student = await this.studentRepo.findOne({
        where: { userId: user.id },
      });
      if (!student) throw new NotFoundException('Student not found');

      const enrollment = await this.enrollmentRepo.findOne({
        where: { courseId, studentId: student.id, isActive: true },
      });
      if (!enrollment) {
        throw new ForbiddenException('You are not enrolled in this course');
      }

      return {
        userId: user.id,
        role: user.role,
        displayName: student.fullName || student.studentId,
        course,
      };
    }

    throw new ForbiddenException('Only teachers and students can access the course stream');
  }

  private async notifyUsersAboutCoursePost(
    post: CoursePost,
    actor: {
      userId: string;
      role: UserRole;
      displayName: string;
      course: Course;
    },
  ) {
    if (actor.role === UserRole.TEACHER) {
      const enrollments = await this.enrollmentRepo.find({
        where: { courseId: post.courseId, isActive: true },
        relations: ['student'],
      });
      const recipientUserIds = enrollments
        .map((enrollment) => enrollment.student?.userId)
        .filter((userId): userId is string => Boolean(userId));

      try {
        await this.notificationsService.createBulk(recipientUserIds, {
          type: NotificationType.SYSTEM,
          title: `${actor.course.courseCode}: ${post.title || 'New class post'}`,
          body: `${actor.displayName} posted an update in ${actor.course.title}.`,
          referenceId: post.id,
          targetPath: `/student/courses/${post.courseId}`,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown notification error';
        this.logger.warn(
          `Failed to notify enrolled students about course post ${post.id}: ${message}`,
        );
      }
      return;
    }

    if (actor.role === UserRole.STUDENT) {
      const teacherUserIds = actor.course.teachers
        .map((teacher) => teacher.userId)
        .filter((userId): userId is string => Boolean(userId));

      try {
        await this.notificationsService.createBulk(teacherUserIds, {
          type: NotificationType.SYSTEM,
          title: `${actor.course.courseCode}: new student question`,
          body: `${actor.displayName} posted in ${actor.course.title}.`,
          referenceId: post.id,
          targetPath: `/teacher/courses/${post.courseId}`,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown notification error';
        this.logger.warn(
          `Failed to notify teachers about course post ${post.id}: ${message}`,
        );
      }
    }
  }
}
