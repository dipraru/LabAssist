import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Course } from './entities/course.entity';
import { Semester } from './entities/semester.entity';
import { Enrollment } from './entities/enrollment.entity';
import { LabSchedule } from './entities/lab-schedule.entity';
import { LectureSheet } from './entities/lecture-sheet.entity';
import { CoursePost } from './entities/course-post.entity';
import { CoursePostComment } from './entities/course-post-comment.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Batch } from '../office/entities/batch.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      Semester,
      Enrollment,
      LabSchedule,
      LectureSheet,
      CoursePost,
      CoursePostComment,
      Student,
      Teacher,
      Batch,
    ]),
    NotificationsModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService, TypeOrmModule],
})
export class CoursesModule {}
