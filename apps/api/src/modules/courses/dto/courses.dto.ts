import {
  IsString, IsEnum, IsOptional, IsNumber, IsUUID, IsBoolean, IsArray, ValidateNested, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CourseType } from '../entities/course.entity';
import { DayOfWeek } from '../entities/lab-schedule.entity';

export class CreateCourseDto {
  @IsString()
  courseCode: string;

  @IsString()
  title: string;

  @IsEnum(CourseType)
  type: CourseType;

  @IsOptional()
  @IsNumber()
  creditHours?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  semesterId: string;
}

export class EnrollStudentsDto {
  @IsUUID()
  courseId: string;

  // Enroll by batch: e.g. '21' => enroll all students of batch 21
  @IsOptional()
  @IsString()
  batchYear?: string;

  // Enroll individually
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentUserIds?: string[];
}

export class AddTeacherToCourseDto {
  @IsUUID()
  courseId: string;

  @IsUUID()
  teacherId: string; // Teacher entity id (uuid)
}

export class CreateScheduleDto {
  @IsUUID()
  courseId: string;

  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @IsString()
  startTime: string; // HH:mm

  @IsString()
  endTime: string;

  @IsOptional()
  @IsString()
  roomNumber?: string;

  @IsOptional()
  @IsString()
  batchYear?: string;
}

class LinkDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class CreateLectureSheetDto {
  @IsUUID()
  courseId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkDto)
  links: LinkDto[];
}
