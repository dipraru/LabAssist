import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Assignment } from './entities/assignment.entity';
import { AssignmentLink } from './entities/assignment-link.entity';
import {
  AssignmentSubmission,
  AssignmentSubmissionStatus,
} from './entities/assignment-submission.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { Course } from '../courses/entities/course.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { AssignmentStatus } from '../../common/enums';
import { UserRole } from '../../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { StorageService } from '../storage/storage.service';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  GradeSubmissionDto,
} from './dto/assignments.dto';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment)
    private assignmentRepo: Repository<Assignment>,
    @InjectRepository(AssignmentLink)
    private linkRepo: Repository<AssignmentLink>,
    @InjectRepository(AssignmentSubmission)
    private submissionRepo: Repository<AssignmentSubmission>,
    @InjectRepository(Course)
    private courseRepo: Repository<Course>,
    @InjectRepository(Enrollment)
    private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
  ) {}

  private isCourseArchived(course: Course): boolean {
    if (course.semester?.isCurrent) {
      return false;
    }

    if (!course.semester?.endDate) {
      return false;
    }

    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const endDate = new Date(course.semester.endDate);
    const endDay = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
    );

    return endDay < todayStart;
  }

  private async getStudentByUserId(studentUserId: string): Promise<Student> {
    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  private async mapAssignmentsWithStudentSubmission(
    assignments: Assignment[],
    studentId: string,
  ): Promise<Array<Assignment & { mySubmission: AssignmentSubmission | null }>> {
    if (!assignments.length) {
      return [];
    }

    const submissions = await this.submissionRepo.find({
      where: assignments.map((assignment) => ({
        assignmentId: assignment.id,
        studentId,
      })),
      order: { updatedAt: 'DESC' },
    });
    const submissionByAssignmentId = new Map<string, AssignmentSubmission>();

    for (const submission of submissions) {
      if (!submissionByAssignmentId.has(submission.assignmentId)) {
        submissionByAssignmentId.set(submission.assignmentId, submission);
      }
    }

    return assignments.map((assignment) =>
      Object.assign(assignment, {
        mySubmission: submissionByAssignmentId.get(assignment.id) ?? null,
      }),
    );
  }

  async createAssignment(
    dto: CreateAssignmentDto,
    teacherUserId: string,
  ): Promise<Assignment> {
    const teacher = await this.teacherRepo.findOne({
      where: { userId: teacherUserId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const course = await this.courseRepo.findOne({
      where: { id: dto.courseId, isActive: true },
      relations: ['teachers', 'semester'],
    });
    if (!course) throw new NotFoundException('Course not found');

    const isAssignedTeacher = course.teachers.some((item) => item.id === teacher.id);
    if (!isAssignedTeacher) {
      throw new ForbiddenException('You are not assigned to this course');
    }

    if (this.isCourseArchived(course)) {
      throw new BadRequestException(
        'Assignments cannot be created for ended semesters',
      );
    }

    const assignment = this.assignmentRepo.create({
      courseId: dto.courseId,
      title: dto.title,
      caption: dto.caption ?? null,
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      allowLateSubmission: dto.allowLateSubmission ?? true,
      totalMarks: dto.totalMarks ?? null,
      status: AssignmentStatus.PUBLISHED,
      createdById: teacher?.id ?? null,
    });
    const saved = await this.assignmentRepo.save(assignment);

    if (dto.links?.length) {
      const links = dto.links.map((l) =>
        this.linkRepo.create({
          assignmentId: saved.id,
          url: l.url,
          label: l.label ?? null,
        }),
      );
      await this.linkRepo.save(links);
    }

    // Notify enrolled students
    const enrollments = await this.enrollmentRepo.find({
      where: { courseId: dto.courseId, isActive: true },
      relations: ['student'],
    });
    const userIds = enrollments.map((e) => e.student.userId);
    await this.notificationsService.createBulk(userIds, {
      type: NotificationType.ASSIGNMENT_POSTED,
      title: `New Assignment: ${dto.title}`,
      body: `A new assignment has been posted. ${dto.deadline ? `Deadline: ${new Date(dto.deadline).toLocaleString()}` : ''}`,
      referenceId: saved.id,
      targetPath: `/student/assignments?assignmentId=${saved.id}`,
    });

    return this.getAssignmentById(saved.id);
  }

  async getAssignmentById(id: string): Promise<Assignment> {
    const a = await this.assignmentRepo.findOne({
      where: { id },
      relations: ['links', 'course', 'createdBy'],
    });
    if (!a) throw new NotFoundException('Assignment not found');
    return a;
  }

  async getAssignmentsByCourse(
    courseId: string,
    requesterUserId?: string,
    requesterRole?: UserRole,
  ): Promise<Array<Assignment & { mySubmission?: AssignmentSubmission | null }>> {
    const assignments = await this.assignmentRepo.find({
      where: { courseId, status: AssignmentStatus.PUBLISHED },
      relations: ['links', 'createdBy'],
      order: { createdAt: 'DESC' },
    });

    if (requesterRole !== UserRole.STUDENT || !requesterUserId) {
      return assignments;
    }

    const student = await this.getStudentByUserId(requesterUserId);
    const enrollment = await this.enrollmentRepo.findOne({
      where: { courseId, studentId: student.id, isActive: true },
    });
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this course');
    }

    return this.mapAssignmentsWithStudentSubmission(assignments, student.id);
  }

  async getAssignmentsForStudent(
    studentUserId: string,
  ): Promise<Array<Assignment & { mySubmission: AssignmentSubmission | null }>> {
    const student = await this.getStudentByUserId(studentUserId);
    const enrollments = await this.enrollmentRepo.find({
      where: { studentId: student.id, isActive: true },
    });
    const courseIds = Array.from(
      new Set(
        enrollments
          .map((enrollment) => enrollment.courseId)
          .filter((courseId): courseId is string => Boolean(courseId)),
      ),
    );

    if (!courseIds.length) {
      return [];
    }

    const assignments = await this.assignmentRepo.find({
      where: {
        courseId: In(courseIds),
        status: AssignmentStatus.PUBLISHED,
      },
      relations: ['links', 'createdBy'],
      order: { createdAt: 'DESC' },
    });

    return this.mapAssignmentsWithStudentSubmission(assignments, student.id);
  }

  async updateAssignment(
    id: string,
    dto: UpdateAssignmentDto,
    teacherUserId: string,
  ): Promise<Assignment> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    Object.assign(assignment, dto);
    if (dto.deadline) assignment.deadline = new Date(dto.deadline);
    await this.assignmentRepo.save(assignment);
    return this.getAssignmentById(id);
  }

  async submitAssignment(
    assignmentId: string,
    studentUserId: string,
    file: Express.Multer.File,
    notes?: string,
  ): Promise<AssignmentSubmission> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.status !== AssignmentStatus.PUBLISHED)
      throw new ForbiddenException('Assignment is closed');

    const isLate = assignment.deadline
      ? new Date() > assignment.deadline
      : false;
    if (isLate && !assignment.allowLateSubmission) {
      throw new ForbiddenException(
        'Late submission is not allowed for this assignment',
      );
    }

    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');

    // Save file
    const stored = await this.storageService.saveBuffer(
      file.buffer,
      file.originalname,
      'assignments',
      10 * 1024 * 1024,
    );

    // Upsert (allow resubmission)
    let submission = await this.submissionRepo.findOne({
      where: { assignmentId, studentId: student.id },
    });

    if (submission) {
      if (submission.fileUrl) {
        // Delete old file
        this.storageService.deleteFile(
          stored.filePath.replace(stored.url, submission.fileUrl),
        );
      }
      submission.fileUrl = stored.url;
      submission.fileName = stored.fileName;
      submission.notes = notes ?? null;
      submission.status = isLate
        ? AssignmentSubmissionStatus.LATE
        : AssignmentSubmissionStatus.RESUBMITTED;
    } else {
      submission = this.submissionRepo.create({
        assignmentId,
        studentId: student.id,
        fileUrl: stored.url,
        fileName: stored.fileName,
        notes: notes ?? null,
        status: isLate
          ? AssignmentSubmissionStatus.LATE
          : AssignmentSubmissionStatus.SUBMITTED,
      });
    }
    return this.submissionRepo.save(submission);
  }

  async gradeSubmission(
    submissionId: string,
    dto: GradeSubmissionDto,
    teacherUserId: string,
  ): Promise<AssignmentSubmission> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    submission.score = dto.score;
    submission.feedback = dto.feedback ?? null;
    submission.status = AssignmentSubmissionStatus.GRADED;
    submission.gradedById = teacherUserId;
    submission.gradedAt = new Date();
    return this.submissionRepo.save(submission);
  }

  async getSubmissionsForAssignment(assignmentId: string) {
    return this.submissionRepo.find({
      where: { assignmentId },
      relations: ['student'],
      order: { submittedAt: 'DESC' },
    });
  }

  async getMySubmission(assignmentId: string, studentUserId: string) {
    const student = await this.studentRepo.findOne({
      where: { userId: studentUserId },
    });
    if (!student) throw new NotFoundException('Student not found');
    return this.submissionRepo.findOne({
      where: { assignmentId, studentId: student.id },
    });
  }
}
