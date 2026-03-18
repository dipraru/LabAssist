import {
  IsString, IsOptional, IsUUID, IsEnum, IsNumber, IsArray, ValidateNested,
  IsDateString, IsBoolean, IsInt, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContestType, ProgrammingLanguage } from '../../../common/enums';

// ─── Problem Bank ────────────────────────────────────────────────────────────

class SampleTestCaseDto {
  @IsString() input: string;
  @IsString() output: string;
  @IsOptional() @IsString() explanation?: string;
}

export class CreateProblemDto {
  @IsString() title: string;
  @IsString() statement: string;
  @IsOptional() @IsInt() timeLimitMs?: number;
  @IsOptional() @IsInt() memoryLimitKb?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SampleTestCaseDto)
  sampleTestCases?: SampleTestCaseDto[];
}

export class UpdateProblemDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() statement?: string;
  @IsOptional() @IsInt() timeLimitMs?: number;
  @IsOptional() @IsInt() memoryLimitKb?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SampleTestCaseDto)
  sampleTestCases?: SampleTestCaseDto[];
}

// ─── Contest Problem (link existing problem to contest) ──────────────────────

export class AddContestProblemDto {
  @IsUUID() problemId: string;
  @IsString() label: string;        // A, B, C …
  @IsInt() orderIndex: number;
  @IsOptional() @IsNumber() score?: number;   // for score_based
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
  @IsOptional() @IsIn(['private', 'public']) standingVisibility?: 'private' | 'public';
  @IsOptional() @IsBoolean() freezeEnabled?: boolean;
  @IsOptional() @IsBoolean() manualUnfreeze?: boolean;
  @IsOptional() @IsInt() freezeBeforeMinutes?: number;
  @IsOptional() @IsInt() freezeAfterMinutes?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AddContestProblemDto)
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
  @IsOptional() @IsIn(['private', 'public']) standingVisibility?: 'private' | 'public';
  @IsOptional() @IsBoolean() freezeEnabled?: boolean;
  @IsOptional() @IsBoolean() manualUnfreeze?: boolean;
  @IsOptional() @IsInt() freezeBeforeMinutes?: number;
  @IsOptional() @IsInt() freezeAfterMinutes?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AddContestProblemDto)
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
  @IsEnum(['accepted','wrong_answer','time_limit_exceeded','memory_limit_exceeded',
           'runtime_error','compilation_error','presentation_error'])
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
  @IsInt() count: number;
  @IsOptional() @IsDateString() accessFrom?: string;
  @IsOptional() @IsDateString() accessUntil?: string;
}

// ─── Judge webhook ───────────────────────────────────────────────────────────

export class ContestJudgeResultDto {
  @IsString() judgeToken: string;
  @IsEnum(['accepted','wrong_answer','time_limit_exceeded','memory_limit_exceeded',
           'runtime_error','compilation_error'])
  verdict: string;
  @IsOptional() @IsInt() executionTimeMs?: number;
  @IsOptional() @IsInt() memoryUsedKb?: number;
}
