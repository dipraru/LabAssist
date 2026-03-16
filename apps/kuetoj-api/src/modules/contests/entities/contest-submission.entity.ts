import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Contest } from './contest.entity';
import { ContestProblem } from './contest-problem.entity';
import { SubmissionStatus, ManualVerdict, ProgrammingLanguage } from '../../../common/enums';

@Entity('contest_submissions')
export class ContestSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Contest, (c) => c.submissions, { onDelete: 'CASCADE' })
  @JoinColumn()
  contest: Contest;

  @Column()
  contestId: string;

  @ManyToOne(() => ContestProblem, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  contestProblem: ContestProblem;

  @Column()
  contestProblemId: string;

  // participantId can be a TempParticipant id
  @Column()
  participantId: string;

  @Column({ type: 'varchar', nullable: true })
  participantName: string | null; // denormalized for standings

  @Column({ type: 'text', nullable: true })
  code: string | null;

  @Column({ type: 'varchar', nullable: true })
  fileUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  fileName: string | null;

  @Column({ type: 'enum', enum: ProgrammingLanguage, nullable: true })
  language: ProgrammingLanguage | null;

  // submission_status: pipeline status
  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    default: SubmissionStatus.PENDING,
  })
  submissionStatus: SubmissionStatus;

  // manual_verdict: judge manually sets this (MVP)
  @Column({ type: 'enum', enum: ManualVerdict, default: ManualVerdict.PENDING, nullable: true })
  manualVerdict: ManualVerdict | null;

  @Column({ type: 'float', nullable: true })
  score: number | null; // for score_based contests

  // ICPC penalty time in minutes
  @Column({ type: 'int', nullable: true })
  penaltyMinutes: number | null;

  @Column({ type: 'int', nullable: true })
  executionTimeMs: number | null;

  @Column({ type: 'int', nullable: true })
  memoryUsedKb: number | null;

  // For future judge webhook: POST /judge/submit + callback POST /api/submissions/{id}/result
  @Column({ type: 'varchar', nullable: true })
  judgeToken: string | null;

  @CreateDateColumn()
  submittedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
