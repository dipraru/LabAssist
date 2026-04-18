import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsInt,
  Min,
  Max,
  Matches,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TeacherDesignation } from '../../users/entities/teacher.entity';
import { ProfileChangeApplicationStatus } from '../entities/profile-change-application.entity';

export class CreateTeacherDto {
  @IsString()
  teacherId: string; // e.g. T2k1807004

  @IsString()
  fullName: string;

  @IsEnum(TeacherDesignation)
  designation: TeacherDesignation;

  @IsEmail()
  email: string;

  @IsString()
  @Matches(/\S/, {
    message: 'phone is required',
  })
  phone: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  profilePhoto?: string;
}

export class CreateStudentsBulkDto {
  @IsOptional()
  @IsString()
  fromStudentId?: string; // e.g. 2107001

  @IsOptional()
  @IsString()
  toStudentId?: string; // e.g. 2107060

  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'batchYear must be a 4-digit year (e.g. 2021)',
  })
  batchYear: string; // e.g. '21'
}

export class CreateStudentDto {
  @IsString()
  studentId: string; // e.g. 2107070

  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'batchYear must be a 4-digit year (e.g. 2021)',
  })
  batchYear: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}

export class CreateTempJudgeDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsDateString()
  accessUntil: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ExtendTempJudgeDto {
  @IsDateString()
  newAccessUntil: string;
}

export class CorrectStudentDto {
  @IsString()
  studentUserId: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CorrectTeacherDto {
  @IsString()
  teacherUserId: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CreateSemesterDto {
  @IsEnum([
    'semester_1',
    'semester_2',
    'semester_3',
    'semester_4',
    'semester_5',
    'semester_6',
    'semester_7',
    'semester_8',
  ])
  name: string;

  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'batchYear must be a 4-digit year (e.g. 2021)',
  })
  batchYear: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class BatchSectionDto {
  @IsString()
  name: string;

  @IsString()
  @Matches(/^\d{7}$/, {
    message: 'fromStudentId must be a 7-digit student ID',
  })
  fromStudentId: string;

  @IsString()
  @Matches(/^\d{7}$/, {
    message: 'toStudentId must be a 7-digit student ID',
  })
  toStudentId: string;
}

export class CreateBatchDto {
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'year must be a 4-digit year (e.g. 2024)',
  })
  year: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26)
  sectionCount: number;

  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(26)
  @ValidateNested({ each: true })
  @Type(() => BatchSectionDto)
  sections: BatchSectionDto[];
}

export class UpdateSemesterStartDateDto {
  @IsDateString()
  startDate: string;
}

export class UpdateProfileChangeApplicationStatusDto {
  @IsEnum(ProfileChangeApplicationStatus)
  status: ProfileChangeApplicationStatus;
}
