import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Course } from './entities/course.entity';
import { Semester } from './entities/semester.entity';
import { Enrollment } from './entities/enrollment.entity';
import { LabSchedule } from './entities/lab-schedule.entity';
import { LabClass } from './entities/lab-class.entity';
import { LabClassSection } from './entities/lab-class-section.entity';
import { LectureSheet } from './entities/lecture-sheet.entity';
import { CoursePost } from './entities/course-post.entity';
import { CoursePostComment } from './entities/course-post-comment.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Batch } from '../office/entities/batch.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { AssignmentSubmission } from '../assignments/entities/assignment-submission.entity';
import { LabTest } from '../lab-tests/entities/lab-test.entity';
import { LabTestProblem } from '../lab-tests/entities/lab-test-problem.entity';
import { LabSubmission } from '../lab-tests/entities/lab-submission.entity';
import { CourseReportPdfService } from './course-report-pdf.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      Semester,
      Enrollment,
      LabSchedule,
      LabClass,
      LabClassSection,
      LectureSheet,
      CoursePost,
      CoursePostComment,
      Student,
      Teacher,
      Batch,
      Assignment,
      AssignmentSubmission,
      LabTest,
      LabTestProblem,
      LabSubmission,
    ]),
    NotificationsModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService, CourseReportPdfService],
  exports: [CoursesService, TypeOrmModule],
})
export class CoursesModule {}
