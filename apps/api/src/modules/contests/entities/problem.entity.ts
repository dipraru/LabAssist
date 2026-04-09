import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ContestProblem } from './contest-problem.entity';

// Problems live in a problem bank; contest links to them via ContestProblem
@Entity('problems')
export class Problem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  problemCode: string | null;

  @Column()
  title: string;

  @Column({ type: 'text' })
  statement: string;

  @Column({ type: 'text', nullable: true })
  inputDescription: string | null;

  @Column({ type: 'text', nullable: true })
  outputDescription: string | null;

  @Column({ type: 'int', nullable: true })
  timeLimitMs: number | null;

  @Column({ type: 'int', nullable: true })
  memoryLimitKb: number | null;

  @Column({ type: 'varchar', nullable: true })
  inputFile: string | null;

  @Column({ type: 'varchar', nullable: true })
  outputFile: string | null;

  // Sample test cases
  @Column({ type: 'jsonb', default: '[]' })
  sampleTestCases: {
    input: string;
    output: string;
    note?: string;
    explanation?: string;
  }[];

  @Column({ type: 'jsonb', default: '[]' })
  hiddenTestCases: {
    input: string;
    output: string;
    inputFileName?: string;
    outputFileName?: string;
  }[];

  // Author info
  @Column({ type: 'varchar', nullable: true })
  authorId: string | null; // judge who created it

  // When true, available in shared problem bank (after original contest ends)
  @Column({ default: false })
  isPublic: boolean;

  // Frozen: prevents edits while contest is running
  @Column({ default: false })
  isFrozen: boolean;

  @OneToMany(() => ContestProblem, (cp) => cp.problem)
  contestProblems: ContestProblem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
