import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ContestSubmission } from './entities/contest-submission.entity';
import { SubmissionStatus, ContestType, ProgrammingLanguage } from '../../common/enums';
import { JudgeRemoteService } from './judge-remote.service';
import { JudgeJobPayload, JudgeResultPayload } from './judge.types';
import { StorageService } from '../storage/storage.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class JudgeDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JudgeDispatchService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly activeSubmissionIds = new Set<string>();
  private tickInProgress = false;

  constructor(
    @InjectRepository(ContestSubmission)
    private readonly submissionRepo: Repository<ContestSubmission>,
    private readonly config: ConfigService,
    private readonly judgeRemote: JudgeRemoteService,
    private readonly storage: StorageService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async onModuleInit() {
    await this.ensureJudgeSubmissionSchema();

    if (!this.judgeRemote.isEnabled()) {
      this.logger.log('Remote judge dispatcher is disabled');
      return;
    }

    const intervalMs = this.getPollIntervalMs();
    this.logger.log(
      `Remote judge dispatcher started for ${this.judgeRemote.getServerName()} with ${intervalMs}ms polling`,
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private getPollIntervalMs(): number {
    return Number(this.config.get<string>('JUDGE_POLL_INTERVAL_MS')) || 3_000;
  }

  private getMaxConcurrentJobs(): number {
    return Number(this.config.get<string>('JUDGE_MAX_CONCURRENT_JOBS')) || 1;
  }

  private getClaimStaleMs(): number {
    return Number(this.config.get<string>('JUDGE_CLAIM_STALE_MS')) || 900_000;
  }

  private getMaxRetryCount(): number {
    return Number(this.config.get<string>('JUDGE_MAX_RETRY_COUNT')) || 3;
  }

  private async ensureJudgeSubmissionSchema() {
    await this.submissionRepo.query(`
      ALTER TABLE "contest_submissions"
      ADD COLUMN IF NOT EXISTS "judgeAttemptCount" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "judgeClaimedAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "judgeServerName" varchar NULL,
      ADD COLUMN IF NOT EXISTS "judgeError" text NULL,
      ADD COLUMN IF NOT EXISTS "judgeMessage" text NULL,
      ADD COLUMN IF NOT EXISTS "compileOutput" text NULL,
      ADD COLUMN IF NOT EXISTS "testcaseResults" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await this.submissionRepo.query(`
      UPDATE "contest_submissions"
      SET "judgeAttemptCount" = 0
      WHERE "judgeAttemptCount" IS NULL
    `);

    await this.submissionRepo.query(`
      UPDATE "contest_submissions"
      SET "testcaseResults" = '[]'::jsonb
      WHERE "testcaseResults" IS NULL
    `);

    await this.submissionRepo.query(`
      ALTER TABLE "contest_submissions"
      ALTER COLUMN "judgeAttemptCount" SET DEFAULT 0,
      ALTER COLUMN "testcaseResults" SET DEFAULT '[]'::jsonb
    `);
  }

  private inferLanguageFromFileName(
    fileName: string | null | undefined,
  ): ProgrammingLanguage | null {
    const normalized = `${fileName ?? ''}`.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.endsWith('.c')) return ProgrammingLanguage.C;
    if (
      normalized.endsWith('.cc') ||
      normalized.endsWith('.cpp') ||
      normalized.endsWith('.cxx')
    ) {
      return ProgrammingLanguage.CPP;
    }
    if (normalized.endsWith('.java')) return ProgrammingLanguage.JAVA;
    if (normalized.endsWith('.py')) return ProgrammingLanguage.PYTHON3;
    if (normalized.endsWith('.js')) return ProgrammingLanguage.JAVASCRIPT;
    if (normalized.endsWith('.ts')) return ProgrammingLanguage.TYPESCRIPT;
    return null;
  }

  private async tick() {
    if (this.tickInProgress) return;
    this.tickInProgress = true;

    try {
      await this.requeueStaleJudgingSubmissions();

      const availableSlots = Math.max(
        0,
        this.getMaxConcurrentJobs() - this.activeSubmissionIds.size,
      );

      for (let index = 0; index < availableSlots; index += 1) {
        const claimedSubmissionId = await this.claimNextPendingSubmission();
        if (!claimedSubmissionId) break;
        this.activeSubmissionIds.add(claimedSubmissionId);
        void this.processSubmission(claimedSubmissionId).finally(() => {
          this.activeSubmissionIds.delete(claimedSubmissionId);
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown judge dispatch error';
      this.logger.error(message);
    } finally {
      this.tickInProgress = false;
    }
  }

  private async claimNextPendingSubmission(): Promise<string | null> {
    const nextSubmission = await this.submissionRepo.findOne({
      where: { submissionStatus: SubmissionStatus.PENDING },
      order: { submittedAt: 'ASC' },
    });

    if (!nextSubmission) return null;

    const updateResult = await this.submissionRepo.update(
      {
        id: nextSubmission.id,
        submissionStatus: SubmissionStatus.PENDING,
      },
      {
        submissionStatus: SubmissionStatus.JUDGING,
        judgeClaimedAt: new Date(),
        judgeServerName: this.judgeRemote.getServerName(),
        judgeError: null,
        judgeMessage: null,
        compileOutput: null,
        judgeAttemptCount: (nextSubmission.judgeAttemptCount ?? 0) + 1,
      },
    );

    return updateResult.affected ? nextSubmission.id : null;
  }

  private async requeueStaleJudgingSubmissions() {
    const staleSubmissions = await this.submissionRepo.find({
      where: {
        submissionStatus: SubmissionStatus.JUDGING,
        judgeClaimedAt: LessThan(new Date(Date.now() - this.getClaimStaleMs())),
      },
    });

    for (const submission of staleSubmissions) {
      if (this.activeSubmissionIds.has(submission.id)) continue;

      const exhaustedRetries =
        (submission.judgeAttemptCount ?? 0) >= this.getMaxRetryCount();
      submission.submissionStatus = exhaustedRetries
        ? SubmissionStatus.MANUAL_REVIEW
        : SubmissionStatus.PENDING;
      submission.judgeError = exhaustedRetries
        ? 'Submission moved to manual review after repeated judge worker timeouts.'
        : 'Submission was re-queued after the judge worker became stale.';
      submission.judgeClaimedAt = null;
      submission.judgeMessage = null;
      submission.compileOutput = null;
      if (exhaustedRetries) {
        submission.judgedAt = new Date();
      }
      await this.submissionRepo.save(submission);
    }
  }

  private async buildJobPayload(
    submission: ContestSubmission,
  ): Promise<JudgeJobPayload> {
    const contestProblem = submission.contestProblem;
    const problem = contestProblem?.problem;

    if (!contestProblem || !problem) {
      throw new Error('Contest problem metadata is missing for this submission');
    }

    const language =
      submission.language ?? this.inferLanguageFromFileName(submission.fileName);
    if (!language) {
      throw new Error('Submission language is missing or unsupported');
    }

    const sourceCode = submission.code
      ? submission.code
      : submission.fileUrl
        ? this.storage.readTextFileByUrl(submission.fileUrl)
        : null;

    if (!sourceCode) {
      throw new Error('Submission source code could not be resolved');
    }

    const sampleCases = (problem.sampleTestCases ?? []).map((testCase, index) => ({
      index: index + 1,
      isSample: true,
      input: testCase.input ?? '',
      output: testCase.output ?? '',
    }));

    const hiddenCases = (problem.hiddenTestCases ?? []).map((testCase, index) => ({
      index: sampleCases.length + index + 1,
      isSample: false,
      input: testCase.input ?? '',
      output: testCase.output ?? '',
    }));

    const testCases = [...sampleCases, ...hiddenCases];
    if (!testCases.length) {
      throw new Error('Problem has no sample or hidden test cases configured');
    }

    return {
      submissionId: submission.id,
      contestId: submission.contestId,
      contestType: submission.contest?.type ?? ContestType.ICPC,
      contestProblemId: contestProblem.id,
      language,
      sourceCode,
      sourceFileName: submission.fileName ?? null,
      maxScore: contestProblem.score ?? null,
      problem: {
        id: problem.id,
        code: problem.problemCode ?? null,
        title: problem.title,
        timeLimitMs: problem.timeLimitMs ?? 1_000,
        memoryLimitKb: problem.memoryLimitKb ?? 262_144,
      },
      testCases,
    };
  }

  private async processSubmission(submissionId: string) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ['contest', 'contestProblem', 'contestProblem.problem'],
    });

    if (!submission) return;

    try {
      const job = await this.buildJobPayload(submission);
      const result = await this.judgeRemote.executeJob(job);
      await this.applyJudgeResult(submission.id, result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown judge worker error';
      await this.handleJudgeFailure(submission.id, message);
    }
  }

  private async applyJudgeResult(
    submissionId: string,
    result: JudgeResultPayload,
  ) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ['contestProblem'],
    });
    if (!submission) return;

    submission.submissionStatus = result.verdict;
    submission.executionTimeMs = result.executionTimeMs ?? null;
    submission.memoryUsedKb = result.memoryUsedKb ?? null;
    submission.score = result.score ?? null;
    submission.judgeError = null;
    submission.judgeMessage = result.judgeMessage ?? null;
    submission.compileOutput = result.compileOutput ?? null;
    submission.testcaseResults = result.testcaseResults ?? [];
    submission.judgedAt = new Date();
    submission.judgeClaimedAt = null;

    const saved = await this.submissionRepo.save(submission);
    this.gateway.sendToContest(saved.contestId, 'verdict', {
      submissionId: saved.id,
      contestProblemId: saved.contestProblemId,
      participantId: saved.participantId,
      verdict: saved.submissionStatus,
      executionTimeMs: saved.executionTimeMs,
      memoryUsedKb: saved.memoryUsedKb,
      score: saved.score,
    });
  }

  private async handleJudgeFailure(submissionId: string, message: string) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
    });
    if (!submission) return;

    const exhaustedRetries =
      (submission.judgeAttemptCount ?? 0) >= this.getMaxRetryCount();

    submission.submissionStatus = exhaustedRetries
      ? SubmissionStatus.MANUAL_REVIEW
      : SubmissionStatus.PENDING;
    submission.judgeError = message;
    submission.judgeClaimedAt = null;
    submission.judgeMessage = null;
    submission.compileOutput = null;

    if (exhaustedRetries) {
      submission.judgedAt = new Date();
      this.logger.error(
        `Submission ${submission.id} moved to manual review after judge failures: ${message}`,
      );
    } else {
      this.logger.warn(
        `Submission ${submission.id} re-queued after judge failure: ${message}`,
      );
    }

    await this.submissionRepo.save(submission);
  }
}
