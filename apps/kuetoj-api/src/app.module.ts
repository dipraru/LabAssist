import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ContestsModule } from './modules/contests/contests.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StorageModule } from './modules/storage/storage.module';

// Entities
import { User } from './modules/users/entities/user.entity';
import { TempJudge } from './modules/users/entities/temp-judge.entity';
import { TempParticipant } from './modules/users/entities/temp-participant.entity';
import { Contest } from './modules/contests/entities/contest.entity';
import { Problem } from './modules/contests/entities/problem.entity';
import { ContestProblem } from './modules/contests/entities/contest-problem.entity';
import { ContestSubmission } from './modules/contests/entities/contest-submission.entity';
import { ContestAnnouncement } from './modules/contests/entities/contest-announcement.entity';
import { ContestClarification } from './modules/contests/entities/contest-clarification.entity';
import { Notification } from './modules/notifications/entities/notification.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        entities: [
          User, TempJudge, TempParticipant,
          Contest, Problem, ContestProblem, ContestSubmission,
          ContestAnnouncement, ContestClarification,
          Notification,
        ],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    StorageModule,
    UsersModule,
    AuthModule,
    ContestsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
