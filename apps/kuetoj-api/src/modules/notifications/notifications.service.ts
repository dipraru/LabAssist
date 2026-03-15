import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
  ) {}

  async createBulk(
    recipientUserIds: string[],
    payload: { type: NotificationType; title: string; body: string; referenceId?: string },
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

    if (payload.type === NotificationType.CONTEST_ANNOUNCEMENT) {
      return;
    }
  }

  async getForUser(userId: string, onlyUnread = false): Promise<Notification[]> {
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
    await this.notifRepo.update({ recipientUserId: userId, isRead: false }, { isRead: true });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.count({ where: { recipientUserId: userId, isRead: false } });
  }
}
