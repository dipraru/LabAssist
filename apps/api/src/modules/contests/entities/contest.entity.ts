import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { TempJudge } from '../../users/entities/temp-judge.entity';
import { ContestProblem } from './contest-problem.entity';
import { ContestSubmission } from './contest-submission.entity';
import { ContestAnnouncement } from './contest-announcement.entity';
import { ContestClarification } from './contest-clarification.entity';
import { ContestType, ContestStatus } from '../../../common/enums';

@Entity('contests')
export class Contest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ContestType })
  type: ContestType; // icpc | score_based

  @Column({ type: 'enum', enum: ContestStatus, default: ContestStatus.DRAFT })
  status: ContestStatus;

  @Column({ type: 'timestamptz' })
  startTime: Date;

  @Column({ type: 'timestamptz' })
  endTime: Date;

  // Freeze: null means no freeze scheduled
  @Column({ type: 'timestamptz', nullable: true })
  freezeTime: Date | null;

  @Column({ default: false })
  isStandingFrozen: boolean;

  @Column({ default: false })
  isPublicStanding: boolean;

  // Created by judge
  @ManyToOne(() => TempJudge, { eager: true, nullable: true })
  @JoinColumn()
  createdBy: TempJudge | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  @OneToMany(() => ContestProblem, (p) => p.contest, { cascade: true })
  problems: ContestProblem[];

  @OneToMany(() => ContestSubmission, (s) => s.contest)
  submissions: ContestSubmission[];

  @OneToMany(() => ContestAnnouncement, (a) => a.contest, { cascade: true })
  announcements: ContestAnnouncement[];

  @OneToMany(() => ContestClarification, (c) => c.contest, { cascade: true })
  clarifications: ContestClarification[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
