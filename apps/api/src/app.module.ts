import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OfficeModule } from './modules/office/office.module';
import { CoursesModule } from './modules/courses/courses.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { LabTestsModule } from './modules/lab-tests/lab-tests.module';
import { LabQuizzesModule } from './modules/lab-quizzes/lab-quizzes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StorageModule } from './modules/storage/storage.module';

// Entities
import { User } from './modules/users/entities/user.entity';
import { Student } from './modules/users/entities/student.entity';
import { Teacher } from './modules/users/entities/teacher.entity';
import { TempJudge } from './modules/users/entities/temp-judge.entity';
import { TempParticipant } from './modules/users/entities/temp-participant.entity';
import { Semester } from './modules/courses/entities/semester.entity';
import { Course } from './modules/courses/entities/course.entity';
import { Enrollment } from './modules/courses/entities/enrollment.entity';
import { LabSchedule } from './modules/courses/entities/lab-schedule.entity';
import { LabClass } from './modules/courses/entities/lab-class.entity';
import { LabClassSection } from './modules/courses/entities/lab-class-section.entity';
import { LectureSheet } from './modules/courses/entities/lecture-sheet.entity';
import { CoursePost } from './modules/courses/entities/course-post.entity';
import { CoursePostComment } from './modules/courses/entities/course-post-comment.entity';
import { Assignment } from './modules/assignments/entities/assignment.entity';
import { AssignmentLink } from './modules/assignments/entities/assignment-link.entity';
import { AssignmentSubmission } from './modules/assignments/entities/assignment-submission.entity';
import { LabTest } from './modules/lab-tests/entities/lab-test.entity';
import { LabTestProblem } from './modules/lab-tests/entities/lab-test-problem.entity';
import { LabSubmission } from './modules/lab-tests/entities/lab-submission.entity';
import { LabProctoringEvent } from './modules/lab-tests/entities/lab-proctoring-event.entity';
import { LabQuiz } from './modules/lab-quizzes/entities/lab-quiz.entity';
import { LabQuizQuestion } from './modules/lab-quizzes/entities/lab-quiz-question.entity';
import { LabQuizAttempt } from './modules/lab-quizzes/entities/lab-quiz-attempt.entity';
import { LabQuizProctoringEvent } from './modules/lab-quizzes/entities/lab-quiz-proctoring-event.entity';
import { Contest } from './modules/contests/entities/contest.entity';
import { Problem } from './modules/contests/entities/problem.entity';
import { ContestProblem } from './modules/contests/entities/contest-problem.entity';
import { ContestSubmission } from './modules/contests/entities/contest-submission.entity';
import { ContestAnnouncement } from './modules/contests/entities/contest-announcement.entity';
import { ContestClarification } from './modules/contests/entities/contest-clarification.entity';
import { Notification } from './modules/notifications/entities/notification.entity';
import { Batch } from './modules/office/entities/batch.entity';
import { ProfileChangeApplication } from './modules/office/entities/profile-change-application.entity';

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
          User,
          Student,
          Teacher,
          TempJudge,
          TempParticipant,
          Semester,
          Course,
          Enrollment,
          LabSchedule,
          LabClass,
          LabClassSection,
          LectureSheet,
          CoursePost,
          CoursePostComment,
          Assignment,
          AssignmentLink,
          AssignmentSubmission,
          LabTest,
          LabTestProblem,
          LabSubmission,
          LabProctoringEvent,
          LabQuiz,
          LabQuizQuestion,
          LabQuizAttempt,
          LabQuizProctoringEvent,
          Contest,
          Problem,
          ContestProblem,
          ContestSubmission,
          ContestAnnouncement,
          ContestClarification,
          Notification,
          Batch,
          ProfileChangeApplication,
        ],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    StorageModule,
    UsersModule,
    AuthModule,
    OfficeModule,
    CoursesModule,
    AssignmentsModule,
    LabTestsModule,
    LabQuizzesModule,
    NotificationsModule,
  ],
})
export class AppModule {}
