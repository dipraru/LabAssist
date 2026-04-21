import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ContestSchemaService implements OnModuleInit {
  private problemBankSchemaPromise: Promise<void> | null = null;

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.ensureProblemBankSchema();
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
}
