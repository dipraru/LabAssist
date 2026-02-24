import {
  IsString, IsEmail, IsOptional, IsEnum, IsDateString,
  IsPhoneNumber, IsArray, IsInt, Min, Max,
} from 'class-validator';
import { TeacherDesignation } from '../../users/entities/teacher.entity';

export class CreateTeacherDto {
  @IsString()
  teacherId: string; // e.g. T2k1807004

  @IsString()
  fullName: string;

  @IsEnum(TeacherDesignation)
  designation: TeacherDesignation;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreateStudentsBulkDto {
  @IsString()
  fromStudentId: string; // e.g. 2107001

  @IsString()
  toStudentId: string; // e.g. 2107060

  @IsString()
  batchYear: string; // e.g. '21'
}

export class CreateStudentDto {
  @IsString()
  studentId: string; // e.g. 2107070

  @IsOptional()
  @IsString()
  fullName?: string;
}

export class CreateTempJudgeDto {
  @IsString()
  fullName: string;

  @IsDateString()
  accessFrom: string;

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
  @IsEnum(['semester_1','semester_2','semester_3','semester_4','semester_5','semester_6','semester_7','semester_8'])
  name: string;

  @IsString()
  batchYear: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
