import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { LabClass } from '../courses/entities/lab-class.entity';
import { Batch } from '../office/entities/batch.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { LabQuiz } from './entities/lab-quiz.entity';
import { LabQuizAttempt } from './entities/lab-quiz-attempt.entity';
import { LabQuizQuestion } from './entities/lab-quiz-question.entity';
import { LabQuizProctoringEvent } from './entities/lab-quiz-proctoring-event.entity';
import { LabQuizReportPdfService } from './lab-quiz-report-pdf.service';
import { LabQuizzesController } from './lab-quizzes.controller';
import { LabQuizzesService } from './lab-quizzes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LabQuiz,
      LabQuizQuestion,
      LabQuizAttempt,
      LabQuizProctoringEvent,
      Course,
      Enrollment,
      LabClass,
      Student,
      Teacher,
      Batch,
    ]),
    NotificationsModule,
  ],
  providers: [LabQuizzesService, LabQuizReportPdfService],
  controllers: [LabQuizzesController],
  exports: [LabQuizzesService],
})
export class LabQuizzesModule {}
