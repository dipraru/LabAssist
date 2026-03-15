import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Contest } from './contest.entity';
import { Problem } from './problem.entity';

@Entity('contest_problems')
export class ContestProblem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Contest, (c) => c.problems, { onDelete: 'CASCADE' })
  @JoinColumn()
  contest: Contest;

  @Column()
  contestId: string;

  @ManyToOne(() => Problem, (p) => p.contestProblems, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  problem: Problem;

  @Column()
  problemId: string;

  // Display label in the contest: A, B, C ...
  @Column()
  label: string;

  @Column({ type: 'int', default: 0 })
  orderIndex: number;

  // For score_based contests, each problem can have its own score
  @Column({ type: 'float', nullable: true })
  score: number | null;
}
