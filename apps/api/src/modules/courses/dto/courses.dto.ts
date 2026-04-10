import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsUUID,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsDateString,
  ArrayMinSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CourseType } from '../entities/course.entity';
import { CoursePostType } from '../entities/course-post.entity';
import { DayOfWeek } from '../entities/lab-schedule.entity';

class CourseScheduleSlotDto {
  @IsString()
  sectionName: string;

  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime must be in HH:mm format',
  })
  endTime: string;
}

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

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  teacherIds: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CourseScheduleSlotDto)
  schedules: CourseScheduleSlotDto[];

  @IsOptional()
  @IsArray()
  @Matches(/^\d{7}$/, {
    each: true,
    message: 'excludedStudentIds must contain valid 7-digit student IDs',
  })
  excludedStudentIds?: string[];
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  courseCode?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(CourseType)
  type?: CourseType;

  @IsOptional()
  @IsNumber()
  creditHours?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  teacherIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CourseScheduleSlotDto)
  schedules?: CourseScheduleSlotDto[];

  @IsOptional()
  @IsArray()
  @Matches(/^\d{7}$/, {
    each: true,
    message: 'excludedStudentIds must contain valid 7-digit student IDs',
  })
  excludedStudentIds?: string[];
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

export class UpdateLectureSheetDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkDto)
  links?: LinkDto[];
}

export class CreateCoursePostDto {
  @IsOptional()
  @IsEnum(CoursePostType)
  type?: CoursePostType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  body: string;
}

export class CreateCoursePostCommentDto {
  @IsString()
  body: string;
}
