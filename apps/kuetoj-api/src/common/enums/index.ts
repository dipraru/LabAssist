export enum SubmissionStatus {
  PENDING = 'pending',
  JUDGING = 'judging',
  ACCEPTED = 'accepted',
  WRONG_ANSWER = 'wrong_answer',
  TIME_LIMIT_EXCEEDED = 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED = 'memory_limit_exceeded',
  RUNTIME_ERROR = 'runtime_error',
  COMPILATION_ERROR = 'compilation_error',
  PRESENTATION_ERROR = 'presentation_error',
  SKIPPED = 'skipped',
  MANUAL_REVIEW = 'manual_review',
}

export enum ManualVerdict {
  ACCEPTED = 'accepted',
  WRONG_ANSWER = 'wrong_answer',
  TIME_LIMIT_EXCEEDED = 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED = 'memory_limit_exceeded',
  RUNTIME_ERROR = 'runtime_error',
  COMPILATION_ERROR = 'compilation_error',
  PARTIAL = 'partial',
  PENDING = 'pending',
}

export enum ProgrammingLanguage {
  C = 'c',
  CPP = 'cpp',
  JAVA = 'java',
  PYTHON = 'python',
  PYTHON3 = 'python3',
  JAVASCRIPT = 'javascript',
  TYPESCRIPT = 'typescript',
}

export enum ContestType {
  ICPC = 'icpc',
  SCORE_BASED = 'score_based',
}

export enum ContestStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  FROZEN = 'frozen',
  ENDED = 'ended',
}

export enum LabTestType {
  VERDICT_BASED = 'verdict_based',
  NON_VERDICT = 'non_verdict',
}

export enum AssignmentStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  CLOSED = 'closed',
}

export enum SemesterName {
  SEMESTER_1 = 'semester_1',
  SEMESTER_2 = 'semester_2',
  SEMESTER_3 = 'semester_3',
  SEMESTER_4 = 'semester_4',
  SEMESTER_5 = 'semester_5',
  SEMESTER_6 = 'semester_6',
  SEMESTER_7 = 'semester_7',
  SEMESTER_8 = 'semester_8',
}
