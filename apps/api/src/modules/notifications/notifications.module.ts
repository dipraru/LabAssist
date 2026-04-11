import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';
import { MailService } from './mail.service';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { LectureSheet } from '../courses/entities/lecture-sheet.entity';
import { CoursePost } from '../courses/entities/course-post.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      User,
      Student,
      Teacher,
      LectureSheet,
      CoursePost,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway, MailService],
  exports: [NotificationsService, NotificationsGateway, MailService],
})
export class NotificationsModule {}
