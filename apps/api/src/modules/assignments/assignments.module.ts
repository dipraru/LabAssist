import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { Assignment } from './entities/assignment.entity';
import { AssignmentLink } from './entities/assignment-link.entity';
import { AssignmentSubmission } from './entities/assignment-submission.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Assignment,
      AssignmentLink,
      AssignmentSubmission,
      Enrollment,
      Student,
      Teacher,
    ]),
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
