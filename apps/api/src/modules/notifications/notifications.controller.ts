import { Controller, Get, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getMyNotifications(
    @CurrentUser() user: { id: string },
    @Query('unread') unread?: string,
  ) {
    return this.notificationsService.getForUser(user.id, unread === 'true');
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: { id: string }) {
    return this.notificationsService
      .getUnreadCount(user.id)
      .then((count) => ({ count }));
  }

  @Patch('mark-read')
  markRead(@CurrentUser() user: { id: string }, @Body('ids') ids: string[]) {
    return this.notificationsService.markRead(user.id, ids);
  }

  @Patch('mark-all-read')
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.notificationsService.markAllRead(user.id);
  }
}
