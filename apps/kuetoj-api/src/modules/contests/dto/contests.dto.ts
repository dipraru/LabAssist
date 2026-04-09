import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
  IsDateString,
  IsBoolean,
  IsInt,
  IsIn,
  ArrayMaxSize,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ContestType,
  ManualVerdict,
  ProgrammingLanguage,
} from '../../../common/enums';

// ─── Problem Bank ────────────────────────────────────────────────────────────

class SampleTestCaseDto {
  @IsString() input: string;
  @IsString() output: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() explanation?: string;
}

class HiddenTestCaseDto {
  @IsString() input: string;
  @IsString() output: string;
  @IsOptional() @IsString() inputFileName?: string;
  @IsOptional() @IsString() outputFileName?: string;
}

export class CreateProblemDto {
  @IsString() title: string;
  @IsString() statement: string;
  @IsOptional() @IsString() inputDescription?: string;
  @IsOptional() @IsString() outputDescription?: string;
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
}

export class UpdateProblemDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() statement?: string;
  @IsOptional() @IsString() inputDescription?: string;
  @IsOptional() @IsString() outputDescription?: string;
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
}

// ─── Contest Problem (link existing problem to contest) ──────────────────────

export class AddContestProblemDto {
  @IsUUID() problemId: string;
  @IsString() label: string; // A, B, C …
  @IsInt() orderIndex: number;
  @IsOptional() @IsNumber() score?: number; // for score_based
}

// ─── Contest ─────────────────────────────────────────────────────────────────

export class CreateContestDto {
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(ContestType) type: ContestType;
  @IsDateString() startTime: string;
  @IsOptional() @IsDateString() endTime?: string;
  @IsOptional() @IsInt() durationHours?: number;
  @IsOptional() @IsInt() durationMinutes?: number;
  @IsOptional() @IsDateString() freezeTime?: string;
  @IsOptional() @IsIn(['private', 'public']) standingVisibility?:
    | 'private'
    | 'public';
  @IsOptional() @IsBoolean() freezeEnabled?: boolean;
  @IsOptional() @IsBoolean() manualUnfreeze?: boolean;
  @IsOptional() @IsInt() freezeBeforeMinutes?: number;
  @IsOptional() @IsInt() freezeAfterMinutes?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddContestProblemDto)
  problems?: AddContestProblemDto[];
}

export class UpdateContestDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(ContestType) type?: ContestType;
  @IsOptional() @IsDateString() startTime?: string;
  @IsOptional() @IsDateString() endTime?: string;
  @IsOptional() @IsInt() durationHours?: number;
  @IsOptional() @IsInt() durationMinutes?: number;
  @IsOptional() @IsIn(['private', 'public']) standingVisibility?:
    | 'private'
    | 'public';
  @IsOptional() @IsBoolean() freezeEnabled?: boolean;
  @IsOptional() @IsBoolean() manualUnfreeze?: boolean;
  @IsOptional() @IsInt() freezeBeforeMinutes?: number;
  @IsOptional() @IsInt() freezeAfterMinutes?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddContestProblemDto)
  problems?: AddContestProblemDto[];
}

// ─── Submission ───────────────────────────────────────────────────────────────

export class ContestSubmitDto {
  @IsUUID() contestProblemId: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsEnum(ProgrammingLanguage) language?: ProgrammingLanguage;
}

// ─── Grade ────────────────────────────────────────────────────────────────────

export class GradeContestSubmissionDto {
  @IsEnum(ManualVerdict)
  verdict: string;
  @IsOptional() @IsNumber() score?: number;
}

// ─── Announcement / Clarification ────────────────────────────────────────────

export class CreateAnnouncementDto {
  @IsString() title: string;
  @IsString() body: string;
  @IsOptional() @IsBoolean() isPinned?: boolean;
}

export class AnswerClarificationDto {
  @IsString() answer: string;
  @IsOptional() @IsBoolean() isBroadcast?: boolean;
}

export class AskClarificationDto {
  @IsString() question: string;
  @IsOptional() @IsUUID() contestProblemId?: string;
}

// ─── Temp Participant ────────────────────────────────────────────────────────

export class CreateTempParticipantsDto {
  @IsUUID() contestId: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  names: string[];
}

// ─── Judge webhook ───────────────────────────────────────────────────────────

export class ContestJudgeResultDto {
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
}
