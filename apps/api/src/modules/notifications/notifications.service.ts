import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { MailService } from './mail.service';
import { User } from '../users/entities/user.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { UserRole } from '../../common/enums/role.enum';
import { LectureSheet } from '../courses/entities/lecture-sheet.entity';
import { CoursePost } from '../courses/entities/course-post.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(LectureSheet)
    private lectureSheetRepo: Repository<LectureSheet>,
    @InjectRepository(CoursePost)
    private coursePostRepo: Repository<CoursePost>,
    private readonly mailService: MailService,
  ) {}

  async createBulk(
    recipientUserIds: string[],
    payload: {
      type: NotificationType;
      title: string;
      body: string;
      referenceId?: string;
      targetPath?: string;
    },
  ): Promise<void> {
    if (!recipientUserIds.length) return;

    const notifications = recipientUserIds.map((userId) =>
      this.notifRepo.create({
        recipientUserId: userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        referenceId: payload.referenceId ?? null,
        targetPath: payload.targetPath ?? null,
      }),
    );
    await this.notifRepo.save(notifications);

    // Send emails for assignment/lecture sheet notifications
    if (
      payload.type === NotificationType.ASSIGNMENT_POSTED ||
      payload.type === NotificationType.LECTURE_SHEET_POSTED
    ) {
      this.sendEmailsForNotifications(
        recipientUserIds,
        payload.title,
        payload.body,
      ).catch(() => {});
    }
  }

  private async sendEmailsForNotifications(
    userIds: string[],
    subject: string,
    body: string,
  ) {
    const students = await this.studentRepo.find({
      where: { userId: In(userIds) },
      select: ['email', 'fullName'],
    });
    const emails = students
      .filter((s) => !!s.email)
      .map((s) => s.email as string);
    for (const email of emails) {
      await this.mailService
        .sendMail({ to: email, subject, body })
        .catch(() => {});
    }
  }

  async getForUser(
    userId: string,
    onlyUnread = false,
  ): Promise<Notification[]> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'role'],
    });
    const query = this.notifRepo
      .createQueryBuilder('n')
      .where('n.recipientUserId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC')
      .take(50);
    if (onlyUnread) query.andWhere('n.isRead = false');
    const notifications = await query.getMany();

    if (!user) {
      return notifications;
    }

    return Promise.all(
      notifications.map(async (notification) => ({
        ...notification,
        targetPath:
          notification.targetPath ??
          (await this.resolveTargetPath(notification, user.role)),
      })),
    );
  }

  private async resolveTargetPath(
    notification: Notification,
    role: UserRole,
  ): Promise<string | null> {
    if (notification.targetPath) {
      return notification.targetPath;
    }

    const referenceId = notification.referenceId;
    if (!referenceId) {
      return null;
    }

    if (notification.type === NotificationType.ASSIGNMENT_POSTED) {
      return role === UserRole.TEACHER
        ? `/teacher/assignments?assignmentId=${referenceId}`
        : `/student/assignments?assignmentId=${referenceId}`;
    }

    if (notification.type === NotificationType.LECTURE_SHEET_POSTED) {
      const sheet = await this.lectureSheetRepo.findOneBy({ id: referenceId });
      if (!sheet) {
        return role === UserRole.TEACHER
          ? `/teacher/lecture-sheets?sheetId=${referenceId}`
          : `/student/courses`;
      }

      return role === UserRole.TEACHER
        ? `/teacher/lecture-sheets?sheetId=${referenceId}`
        : `/student/courses/${sheet.courseId}?sheetId=${referenceId}`;
    }

    if (notification.type === NotificationType.SYSTEM) {
      const post = await this.coursePostRepo.findOneBy({ id: referenceId });
      if (!post) {
        return role === UserRole.TEACHER
          ? '/teacher/notifications'
          : '/student/notifications';
      }

      return role === UserRole.TEACHER
        ? `/teacher/courses/${post.courseId}`
        : `/student/courses/${post.courseId}`;
    }

    if (notification.type === NotificationType.CONTEST_ANNOUNCEMENT) {
      return role === UserRole.TEACHER ? '/teacher' : '/student';
    }

    return null;
  }

  async markRead(userId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.notifRepo
      .createQueryBuilder()
      .update()
      .set({ isRead: true })
      .where('recipientUserId = :userId AND id IN (:...ids)', { userId, ids })
      .execute();
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifRepo.update(
      { recipientUserId: userId, isRead: false },
      { isRead: true },
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.count({
      where: { recipientUserId: userId, isRead: false },
    });
  }
}
