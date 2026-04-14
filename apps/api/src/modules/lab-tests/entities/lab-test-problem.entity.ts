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
import { LabTest } from './lab-test.entity';
import { LabSubmission } from './lab-submission.entity';

@Entity('lab_test_problems')
export class LabTestProblem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  statement: string;

  @Column({ type: 'text', nullable: true })
  inputDescription: string | null;

  @Column({ type: 'text', nullable: true })
  outputDescription: string | null;

  @Column({ type: 'int', default: 1 })
  orderIndex: number;

  @Column({ type: 'float', nullable: true })
  marks: number | null;

  // verdict_based metadata (stored as metadata even if judge not active)
  @Column({ type: 'int', nullable: true })
  timeLimitMs: number | null; // in milliseconds

  @Column({ type: 'int', nullable: true })
  memoryLimitKb: number | null; // in kilobytes

  @Column({ type: 'varchar', nullable: true })
  inputFile: string | null; // path to input file

  @Column({ type: 'varchar', nullable: true })
  outputFile: string | null; // path to output file

  // Sample test cases stored as JSON
  @Column({ type: 'jsonb', default: '[]' })
  sampleTestCases: { input: string; output: string; explanation?: string }[];

  @Column({ type: 'jsonb', default: '[]' })
  hiddenTestCases: { input: string; output: string }[];

  @Column({ type: 'varchar', nullable: true })
  sourceProblemId: string | null;

  @ManyToOne(() => LabTest, (lt) => lt.problems, { onDelete: 'CASCADE' })
  @JoinColumn()
  labTest: LabTest;

  @Column()
  labTestId: string;

  @OneToMany(() => LabSubmission, (s) => s.problem)
  submissions: LabSubmission[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
