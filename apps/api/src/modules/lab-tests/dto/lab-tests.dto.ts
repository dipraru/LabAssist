import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
  IsDateString,
  IsInt,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LabTestType } from '../../../common/enums';
import { ProgrammingLanguage, ManualVerdict } from '../../../common/enums';
import { LabActivityKind } from '../entities/lab-test.entity';

class SampleTestCaseDto {
  @IsString() input: string;
  @IsString() output: string;
  @IsOptional() @IsString() explanation?: string;
}

class HiddenTestCaseDto {
  @IsString() input: string;
  @IsString() output: string;
}

export class CreateProblemDto {
  @IsString() title: string;
  @IsString() statement: string;
  @IsOptional() @IsString() inputDescription?: string;
  @IsOptional() @IsString() outputDescription?: string;
  @IsOptional() @IsNumber() marks?: number;
  @IsOptional() @IsInt() timeLimitMs?: number;
  @IsOptional() @IsInt() memoryLimitKb?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleTestCaseDto)
  sampleTestCases?: SampleTestCaseDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HiddenTestCaseDto)
  hiddenTestCases?: HiddenTestCaseDto[];
  @IsOptional() @IsBoolean() saveToBank?: boolean;
}

export class CreateLabTestDto {
  @IsUUID() courseId: string;
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(LabActivityKind) activityKind: LabActivityKind;
  @IsEnum(LabTestType) type: LabTestType;
  @IsDateString() startTime: string;
  @IsDateString() endTime: string;
  @IsOptional() @IsNumber() totalMarks?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProblemDto)
  problems?: CreateProblemDto[];
}

export class SubmitLabCodeDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsEnum(ProgrammingLanguage) language?: ProgrammingLanguage;
}

export class RunLabCodeDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsEnum(ProgrammingLanguage) language?: ProgrammingLanguage;
}

export class ImportProblemDto {
  @IsUUID() problemId: string;
}

export class ManualGradeDto {
  @IsEnum(ManualVerdict) verdict: ManualVerdict;
  @IsOptional() @IsNumber() score?: number;
  @IsOptional() @IsString() instructorNote?: string;
}

// Future judge callback contract: POST /api/submissions/:id/result
export class JudgeResultCallbackDto {
  @IsString() judgeToken: string;
  @IsEnum([
    'accepted',
    'wrong_answer',
    'time_limit_exceeded',
    'memory_limit_exceeded',
    'runtime_error',
    'compilation_error',
  ])
  verdict: string;
  @IsOptional() @IsInt() executionTimeMs?: number;
  @IsOptional() @IsInt() memoryUsedKb?: number;
  @IsOptional() @IsString() compileError?: string;
}
