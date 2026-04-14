import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LabTestProblem } from './lab-test-problem.entity';
import { Student } from '../../users/entities/student.entity';
import {
  SubmissionStatus,
  ManualVerdict,
  ProgrammingLanguage,
} from '../../../common/enums';

@Entity('lab_submissions')
export class LabSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LabTestProblem, (p) => p.submissions, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  problem: LabTestProblem;

  @Column()
  problemId: string;

  @ManyToOne(() => Student, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  student: Student;

  @Column()
  studentId: string;

  @Column({ type: 'text', nullable: true })
  code: string | null; // submitted via editor

  @Column({ type: 'varchar', nullable: true })
  fileUrl: string | null; // submitted via file upload

  @Column({ type: 'varchar', nullable: true })
  fileName: string | null;

  @Column({ type: 'enum', enum: ProgrammingLanguage, nullable: true })
  language: ProgrammingLanguage | null;

  // submission_status: where it stands in the pipeline
  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    default: SubmissionStatus.MANUAL_REVIEW,
  })
  submissionStatus: SubmissionStatus;

  // manual_verdict: given by instructor (for non-verdict based or manual override)
  @Column({
    type: 'enum',
    enum: ManualVerdict,
    default: ManualVerdict.PENDING,
    nullable: true,
  })
  manualVerdict: ManualVerdict | null;

  @Column({ type: 'float', nullable: true })
  score: number | null;

  @Column({ type: 'text', nullable: true })
  instructorNote: string | null;

  @Column({ type: 'varchar', nullable: true })
  gradedById: string | null; // teacher userId

  @Column({ type: 'timestamptz', nullable: true })
  gradedAt: Date | null;

  // For future automated judge integration:
  // POST /judge/submit hook will update these
  @Column({ type: 'int', nullable: true })
  executionTimeMs: number | null;

  @Column({ type: 'int', nullable: true })
  memoryUsedKb: number | null;

  @Column({ type: 'varchar', nullable: true })
  judgeToken: string | null; // token for callback POST /api/submissions/{id}/result

  @Column({ type: 'text', nullable: true })
  judgeMessage: string | null;

  @Column({ type: 'text', nullable: true })
  compileOutput: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  testcaseResults: {
    index: number;
    isSample: boolean;
    verdict: SubmissionStatus;
    timeMs?: number | null;
    memoryKb?: number | null;
    message?: string | null;
  }[];

  @CreateDateColumn()
  submittedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
