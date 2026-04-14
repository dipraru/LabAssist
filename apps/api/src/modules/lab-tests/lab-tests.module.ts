import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabTest } from './entities/lab-test.entity';
import { LabTestProblem } from './entities/lab-test-problem.entity';
import { LabSubmission } from './entities/lab-submission.entity';
import { LabTestsService } from './lab-tests.service';
import { LabTestsController } from './lab-tests.controller';
import { Problem } from '../contests/entities/problem.entity';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { Student } from '../users/entities/student.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { LabJudgeRemoteService } from './judge-remote.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LabTest,
      LabTestProblem,
      LabSubmission,
      Problem,
      Course,
      Enrollment,
      Teacher,
      Student,
    ]),
    NotificationsModule,
  ],
  providers: [LabTestsService, LabJudgeRemoteService],
  controllers: [LabTestsController],
  exports: [LabTestsService],
})
export class LabTestsModule {}
