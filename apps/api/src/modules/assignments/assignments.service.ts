import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Assignment } from './entities/assignment.entity';
import { AssignmentLink } from './entities/assignment-link.entity';
import {
  AssignmentSubmission,
  AssignmentSubmissionStatus,
} from './entities/assignment-submission.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { AssignmentStatus } from '../../common/enums';
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
    @InjectRepository(Enrollment)
    private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
  ) {}

  async createAssignment(
    dto: CreateAssignmentDto,
    teacherUserId: string,
  ): Promise<Assignment> {
    const teacher = await this.teacherRepo.findOne({
      where: { userId: teacherUserId },
    });
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

  async getAssignmentsByCourse(courseId: string): Promise<Assignment[]> {
    return this.assignmentRepo.find({
      where: { courseId, status: AssignmentStatus.PUBLISHED },
      relations: ['links', 'createdBy'],
      order: { createdAt: 'DESC' },
    });
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
