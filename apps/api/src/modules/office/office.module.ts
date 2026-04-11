import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfficeController } from './office.controller';
import { OfficeService } from './office.service';
import { PdfService } from './pdf.service';
import { User } from '../users/entities/user.entity';
import { Student } from '../users/entities/student.entity';
import { Teacher } from '../users/entities/teacher.entity';
import { TempJudge } from '../users/entities/temp-judge.entity';
import { Semester } from '../courses/entities/semester.entity';
import { Course } from '../courses/entities/course.entity';
import { Batch } from './entities/batch.entity';
import { LabTest } from '../lab-tests/entities/lab-test.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Student,
      Teacher,
      TempJudge,
      Semester,
      Course,
      Batch,
      LabTest,
    ]),
  ],
  controllers: [OfficeController],
  providers: [OfficeService, PdfService],
  exports: [OfficeService],
})
export class OfficeModule {}
