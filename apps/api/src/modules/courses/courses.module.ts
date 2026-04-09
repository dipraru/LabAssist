import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Course } from './entities/course.entity';
import { Semester } from './entities/semester.entity';
import { Enrollment } from './entities/enrollment.entity';
import { LabSchedule } from './entities/lab-schedule.entity';
import { LectureSheet } from './entities/lecture-sheet.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      Semester,
      Enrollment,
      LabSchedule,
      LectureSheet,
      Student,
      Teacher,
    ]),
    NotificationsModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService, TypeOrmModule],
})
export class CoursesModule {}
