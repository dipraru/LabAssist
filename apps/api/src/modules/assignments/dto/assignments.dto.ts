import {
  IsString, IsOptional, IsUUID, IsBoolean, IsNumber, IsDateString, IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssignmentStatus } from '../../../common/enums';

class LinkDto {
  @IsString()
  url: string;
  @IsOptional() @IsString()
  label?: string;
}

export class CreateAssignmentDto {
  @IsUUID()
  courseId: string;
  @IsString()
  title: string;
  @IsOptional() @IsString()
  caption?: string;
  @IsOptional() @IsDateString()
  deadline?: string;
  @IsOptional() @IsBoolean()
  allowLateSubmission?: boolean;
  @IsOptional() @IsNumber()
  totalMarks?: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkDto)
  links: LinkDto[];
}

export class UpdateAssignmentDto {
  @IsOptional() @IsString()
  title?: string;
  @IsOptional() @IsString()
  caption?: string;
  @IsOptional() @IsDateString()
  deadline?: string;
  @IsOptional() @IsBoolean()
  allowLateSubmission?: boolean;
  @IsOptional() @IsNumber()
  totalMarks?: number;
  @IsOptional()
  status?: AssignmentStatus;
}

export class GradeSubmissionDto {
  @IsNumber()
  score: number;
  @IsOptional() @IsString()
  feedback?: string;
}
