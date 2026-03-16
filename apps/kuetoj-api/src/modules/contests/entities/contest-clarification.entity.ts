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

export enum ClarificationStatus {
  OPEN = 'open',
  ANSWERED = 'answered',
  CLOSED = 'closed',
}

@Entity('contest_clarifications')
export class ContestClarification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Contest, (c) => c.clarifications, { onDelete: 'CASCADE' })
  @JoinColumn()
  contest: Contest;

  @Column()
  contestId: string;

  @Column()
  participantId: string;

  @Column({ type: 'varchar', nullable: true })
  participantName: string | null;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column({ type: 'varchar', nullable: true })
  answeredById: string | null;

  @Column({ type: 'enum', enum: ClarificationStatus, default: ClarificationStatus.OPEN })
  status: ClarificationStatus;

  // Which problem it relates to (nullable = general question)
  @Column({ type: 'varchar', nullable: true })
  contestProblemId: string | null;

  // If true, the answer is sent to ALL participants (broadcast)
  @Column({ default: false })
  isBroadcast: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
