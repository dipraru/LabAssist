import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LabProctoringEventType } from '../../lab-tests/entities/lab-proctoring-event.entity';
import { LabQuizQuestionType } from '../entities/lab-quiz-question.entity';

export class CreateLabQuizQuestionDto {
  @IsEnum(LabQuizQuestionType)
  questionType: LabQuizQuestionType;

  @IsString()
  prompt: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  correctOptionIndex?: number;

  @IsOptional()
  @IsString()
  answerKey?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marks?: number;
}

export class UpdateLabQuizQuestionDto {
  @IsOptional()
  @IsEnum(LabQuizQuestionType)
  questionType?: LabQuizQuestionType;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  correctOptionIndex?: number;

  @IsOptional()
  @IsString()
  answerKey?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marks?: number;
}

export class CreateLabQuizDto {
  @IsUUID()
  courseId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  durationMinutes: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalMarks?: number;

  @IsOptional()
  @IsString()
  sectionName?: string;

  @IsOptional()
  @IsUUID()
  labClassId?: string;

  @IsOptional()
  @IsBoolean()
  proctoringEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLabQuizQuestionDto)
  questions?: CreateLabQuizQuestionDto[];
}

export class UpdateLabQuizDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalMarks?: number;

  @IsOptional()
  @IsString()
  sectionName?: string;

  @IsOptional()
  @IsUUID()
  labClassId?: string;

  @IsOptional()
  @IsBoolean()
  proctoringEnabled?: boolean;
}

export class LabQuizAnswerDto {
  @IsUUID()
  questionId: string;

  @IsOptional()
  @IsString()
  selectedOptionId?: string;

  @IsOptional()
  @IsString()
  answerText?: string;
}

export class SubmitLabQuizDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabQuizAnswerDto)
  answers: LabQuizAnswerDto[];
}

export class LabQuizGradeDto {
  @IsUUID()
  questionId: string;

  @IsNumber()
  @Min(0)
  score: number;

  @IsOptional()
  @IsString()
  teacherNote?: string;
}

export class GradeLabQuizAttemptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabQuizGradeDto)
  grades: LabQuizGradeDto[];
}

export class ReportLabQuizProctoringEventDto {
  @IsEnum(LabProctoringEventType)
  eventType: LabProctoringEventType;

  @IsOptional()
  @IsUUID()
  questionId?: string;

  @IsOptional()
  @IsString()
  message?: string;
}
