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

export class CreateLabClassDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  classDate?: string;
}

class AttendanceRecordDto {
  @IsString()
  studentId: string;

  @IsBoolean()
  isPresent: boolean;
}

export class TakeLabClassAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  attendance: AttendanceRecordDto[];
}

export class UpdateLabClassSectionScheduleDto {
  @IsDateString()
  scheduledDate: string;

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

  @IsOptional()
  @IsString()
  roomNumber?: string;
}

export class CreateLectureSheetDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkDto)
  links: LinkDto[];

  @IsOptional()
  @IsUUID()
  labClassId?: string;

  @IsOptional()
  @IsString()
  sectionName?: string;
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

  @IsOptional()
  @IsUUID()
  labClassId?: string | null;

  @IsOptional()
  @IsString()
  sectionName?: string | null;
}

export class CreateCoursePostDto {
  @IsOptional()
  @IsEnum(CoursePostType)
  type?: CoursePostType;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsUUID()
  labClassId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetSectionNames?: string[];
}

export class CreateCoursePostCommentDto {
  @IsString()
  body: string;
}

export class UpdateCoursePostSolvedDto {
  @IsBoolean()
  isSolved: boolean;
}

export class UpsertUpcomingSectionScheduleDto {
  @IsString()
  sectionName: string;

  @IsDateString()
  scheduledDate: string;

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

  @IsOptional()
  @IsString()
  roomNumber?: string;
}
