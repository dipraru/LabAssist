import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ContestSchemaService implements OnModuleInit {
  private problemBankSchemaPromise: Promise<void> | null = null;
  private contestRuntimeSchemaPromise: Promise<void> | null = null;

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.ensureProblemBankSchema();
    await this.ensureContestRuntimeSchema();
  }

  ensureProblemBankSchema(): Promise<void> {
    if (!this.problemBankSchemaPromise) {
      this.problemBankSchemaPromise =
        this.ensureProblemBankSchemaInternal().catch((error) => {
          this.problemBankSchemaPromise = null;
          throw error;
        });
    }

    return this.problemBankSchemaPromise;
  }

  ensureContestRuntimeSchema(): Promise<void> {
    if (!this.contestRuntimeSchemaPromise) {
      this.contestRuntimeSchemaPromise =
        this.ensureContestRuntimeSchemaInternal().catch((error) => {
          this.contestRuntimeSchemaPromise = null;
          throw error;
        });
    }

    return this.contestRuntimeSchemaPromise;
  }

  private async ensureProblemBankSchemaInternal(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE "problems"
      ADD COLUMN IF NOT EXISTS "statementFormat" varchar NOT NULL DEFAULT 'text',
      ADD COLUMN IF NOT EXISTS "inputDescription" text NULL,
      ADD COLUMN IF NOT EXISTS "inputDescriptionFormat" varchar NOT NULL DEFAULT 'text',
      ADD COLUMN IF NOT EXISTS "outputDescription" text NULL,
      ADD COLUMN IF NOT EXISTS "outputDescriptionFormat" varchar NOT NULL DEFAULT 'text',
      ADD COLUMN IF NOT EXISTS "sampleTestCases" jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "hiddenTestCases" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await this.dataSource.query(`
      UPDATE "problems"
      SET
        "statementFormat" = CASE
          WHEN "statementFormat" IN ('text', 'latex') THEN "statementFormat"
          ELSE 'text'
        END,
        "inputDescriptionFormat" = CASE
          WHEN "inputDescriptionFormat" IN ('text', 'latex') THEN "inputDescriptionFormat"
          ELSE 'text'
        END,
        "outputDescriptionFormat" = CASE
          WHEN "outputDescriptionFormat" IN ('text', 'latex') THEN "outputDescriptionFormat"
          ELSE 'text'
        END,
        "sampleTestCases" = COALESCE("sampleTestCases", '[]'::jsonb),
        "hiddenTestCases" = COALESCE("hiddenTestCases", '[]'::jsonb)
      WHERE
        "statementFormat" IS NULL
        OR "statementFormat" NOT IN ('text', 'latex')
        OR "inputDescriptionFormat" IS NULL
        OR "inputDescriptionFormat" NOT IN ('text', 'latex')
        OR "outputDescriptionFormat" IS NULL
        OR "outputDescriptionFormat" NOT IN ('text', 'latex')
        OR "sampleTestCases" IS NULL
        OR "hiddenTestCases" IS NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE "problems"
      ALTER COLUMN "statementFormat" SET DEFAULT 'text',
      ALTER COLUMN "statementFormat" SET NOT NULL,
      ALTER COLUMN "inputDescriptionFormat" SET DEFAULT 'text',
      ALTER COLUMN "inputDescriptionFormat" SET NOT NULL,
      ALTER COLUMN "outputDescriptionFormat" SET DEFAULT 'text',
      ALTER COLUMN "outputDescriptionFormat" SET NOT NULL,
      ALTER COLUMN "sampleTestCases" SET DEFAULT '[]'::jsonb,
      ALTER COLUMN "sampleTestCases" SET NOT NULL,
      ALTER COLUMN "hiddenTestCases" SET DEFAULT '[]'::jsonb,
      ALTER COLUMN "hiddenTestCases" SET NOT NULL
    `);
  }

  private async ensureContestRuntimeSchemaInternal(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE "temp_participants"
      ADD COLUMN IF NOT EXISTS "universityName" varchar NULL,
      ADD COLUMN IF NOT EXISTS "accessFrom" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "accessUntil" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "loginPassword" varchar NULL,
      ADD COLUMN IF NOT EXISTS "createdByJudgeId" varchar NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE "contest_clarifications"
      ADD COLUMN IF NOT EXISTS "participantName" varchar NULL,
      ADD COLUMN IF NOT EXISTS "answeredById" varchar NULL,
      ADD COLUMN IF NOT EXISTS "answerEditedAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "contestProblemId" varchar NULL,
      ADD COLUMN IF NOT EXISTS "isBroadcast" boolean NOT NULL DEFAULT false
    `);

    await this.dataSource.query(`
      UPDATE "contest_clarifications"
      SET "isBroadcast" = false
      WHERE "isBroadcast" IS NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE "contest_clarifications"
      ALTER COLUMN "isBroadcast" SET DEFAULT false,
      ALTER COLUMN "isBroadcast" SET NOT NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE "contest_submissions"
      ADD COLUMN IF NOT EXISTS "participantName" varchar NULL,
      ADD COLUMN IF NOT EXISTS "fileUrl" varchar NULL,
      ADD COLUMN IF NOT EXISTS "fileName" varchar NULL,
      ADD COLUMN IF NOT EXISTS "executionTimeMs" integer NULL,
      ADD COLUMN IF NOT EXISTS "memoryUsedKb" integer NULL,
      ADD COLUMN IF NOT EXISTS "judgeAttemptCount" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "judgeClaimedAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "judgedAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "judgeServerName" varchar NULL,
      ADD COLUMN IF NOT EXISTS "judgeError" text NULL,
      ADD COLUMN IF NOT EXISTS "judgeMessage" text NULL,
      ADD COLUMN IF NOT EXISTS "compileOutput" text NULL,
      ADD COLUMN IF NOT EXISTS "testcaseResults" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await this.dataSource.query(`
      UPDATE "contest_submissions"
      SET
        "judgeAttemptCount" = COALESCE("judgeAttemptCount", 0),
        "testcaseResults" = COALESCE("testcaseResults", '[]'::jsonb)
      WHERE "judgeAttemptCount" IS NULL
        OR "testcaseResults" IS NULL
    `);

    await this.dataSource.query(`
      ALTER TABLE "contest_submissions"
      ALTER COLUMN "judgeAttemptCount" SET DEFAULT 0,
      ALTER COLUMN "testcaseResults" SET DEFAULT '[]'::jsonb,
      ALTER COLUMN "testcaseResults" SET NOT NULL
    `);
  }
}
