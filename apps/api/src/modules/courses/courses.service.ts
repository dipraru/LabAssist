import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Course } from './entities/course.entity';
import { Semester } from './entities/semester.entity';
import { Enrollment } from './entities/enrollment.entity';
import { LabSchedule } from './entities/lab-schedule.entity';
import { LectureSheet } from './entities/lecture-sheet.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import {
  CreateCourseDto,
  UpdateCourseDto,
  EnrollStudentsDto,
  AddTeacherToCourseDto,
  CreateScheduleDto,
  CreateLectureSheetDto,
  UpdateLectureSheetDto,
} from './dto/courses.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

function batchYearVariants(batchYear: string): string[] {
  const digits = batchYear.replace(/\D/g, '');
  if (digits.length === 4) return [digits, digits.slice(2)];
  if (digits.length === 2) return [digits, `20${digits}`];
  return [batchYear];
}

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Semester) private semesterRepo: Repository<Semester>,
    @InjectRepository(Enrollment)
    private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(LabSchedule)
    private scheduleRepo: Repository<LabSchedule>,
    @InjectRepository(LectureSheet)
    private lectureSheetRepo: Repository<LectureSheet>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createCourse(dto: CreateCourseDto): Promise<Course> {
    const semester = await this.semesterRepo.findOne({
      where: { id: dto.semesterId },
    });
    if (!semester) throw new NotFoundException('Semester not found');

    const course = this.courseRepo.create({
      courseCode: dto.courseCode,
      title: dto.title,
      type: dto.type,
      creditHours: dto.creditHours ?? 3,
      description: dto.description ?? null,
      semesterId: dto.semesterId,
      teachers: [],
    });
    const savedCourse = await this.courseRepo.save(course);

    const students = await this.studentRepo.find({
      where: { batchYear: In(batchYearVariants(semester.batchYear)) },
    });
    if (students.length) {
      const enrollments = students.map((student) =>
        this.enrollmentRepo.create({
          courseId: savedCourse.id,
          studentId: student.id,
          isActive: true,
        }),
      );
      await this.enrollmentRepo.save(enrollments);
    }

    return this.getCourseById(savedCourse.id);
  }

  async updateCourse(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.courseRepo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');

    if (dto.semesterId && dto.semesterId !== course.semesterId) {
      const semester = await this.semesterRepo.findOne({
        where: { id: dto.semesterId },
      });
      if (!semester) throw new NotFoundException('Semester not found');
      course.semesterId = dto.semesterId;
    }

    if (dto.courseCode !== undefined) course.courseCode = dto.courseCode;
    if (dto.title !== undefined) course.title = dto.title;
    if (dto.type !== undefined) course.type = dto.type;
    if (dto.creditHours !== undefined) course.creditHours = dto.creditHours;
    if (dto.description !== undefined)
      course.description = dto.description ?? null;

    await this.courseRepo.save(course);
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
      relations: ['teachers', 'semester', 'schedules'],
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async getCoursesByTeacher(teacherUserId: string): Promise<Course[]> {
    const teacher = await this.teacherRepo.findOne({
      where: { userId: teacherUserId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    return this.courseRepo
      .createQueryBuilder('course')
      .innerJoin('course.teachers', 'teacher', 'teacher.id = :tid', {
        tid: teacher.id,
      })
      .leftJoinAndSelect('course.semester', 'semester')
      .leftJoinAndSelect('course.schedules', 'schedules')
      .where('course.isActive = true')
      .getMany();
  }

  async getCoursesByStudent(studentUserId: string): Promise<Course[]> {
    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');
    return this.courseRepo
      .createQueryBuilder('course')
      .innerJoin(
        'course.enrollments',
        'enrollment',
        'enrollment.studentId = :sid AND enrollment.isActive = true',
        { sid: student.id },
      )
      .leftJoinAndSelect('course.teachers', 'teacher')
      .leftJoinAndSelect('course.semester', 'semester')
      .where('course.isActive = true')
      .getMany();
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

  async createLectureSheet(
    dto: CreateLectureSheetDto,
    teacherUserId: string,
  ): Promise<LectureSheet> {
    const teacher = await this.teacherRepo.findOne({
      where: { userId: teacherUserId },
    });
    const sheet = this.lectureSheetRepo.create({
      courseId: dto.courseId,
      title: dto.title,
      description: dto.description ?? null,
      links: dto.links,
      postedById: teacher?.id ?? null,
    });
    const saved = await this.lectureSheetRepo.save(sheet);

    // Notify enrolled students
    await this.notifyEnrolledStudents(dto.courseId, {
      type: NotificationType.LECTURE_SHEET_POSTED,
      title: `New Lecture Sheet: ${dto.title}`,
      body: `A new lecture sheet has been posted in your course.`,
      referenceId: saved.id,
    });

    return saved;
  }

  async getLectureSheets(courseId: string): Promise<LectureSheet[]> {
    return this.lectureSheetRepo.find({
      where: { courseId },
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
    },
  ) {
    const enrollments = await this.enrollmentRepo.find({
      where: { courseId, isActive: true },
      relations: ['student', 'student.user'],
    });
    const userIds = enrollments.map((e) => e.student.userId);
    await this.notificationsService.createBulk(userIds, payload);
  }

  async getAllCourses(): Promise<Course[]> {
    return this.courseRepo.find({
      relations: ['semester', 'teachers', 'schedules'],
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
}
