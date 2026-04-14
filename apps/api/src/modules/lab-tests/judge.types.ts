import { ProgrammingLanguage, SubmissionStatus } from '../../common/enums';

export interface JudgeJobCasePayload {
  index: number;
  isSample: boolean;
  input: string;
  output: string;
}

export interface JudgeJobPayload {
  submissionId: string;
  language: ProgrammingLanguage;
  sourceCode: string;
  sourceFileName: string | null;
  maxScore: number | null;
  problem: {
    id: string;
    code: string | null;
    title: string;
    timeLimitMs: number;
    memoryLimitKb: number;
  };
  testCases: JudgeJobCasePayload[];
}

export interface JudgeCaseResultPayload {
  index: number;
  isSample: boolean;
  verdict: SubmissionStatus;
  timeMs: number | null;
  memoryKb: number | null;
  message?: string | null;
}

export interface JudgeResultPayload {
  verdict: SubmissionStatus;
  executionTimeMs: number | null;
  memoryUsedKb: number | null;
  score: number | null;
  judgeMessage: string | null;
  compileOutput: string | null;
  testcaseResults: JudgeCaseResultPayload[];
}
