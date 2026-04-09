import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { MailService } from './mail.service';
import { User } from '../users/entities/user.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    private readonly mailService: MailService,
  ) {}

  async createBulk(
    recipientUserIds: string[],
    payload: {
      type: NotificationType;
      title: string;
      body: string;
      referenceId?: string;
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
    const query = this.notifRepo
      .createQueryBuilder('n')
      .where('n.recipientUserId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC')
      .take(50);
    if (onlyUnread) query.andWhere('n.isRead = false');
    return query.getMany();
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
