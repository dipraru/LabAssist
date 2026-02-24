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
import { Course } from '../../courses/entities/course.entity';
import { LabTestProblem } from './lab-test-problem.entity';
import { LabTestType } from '../../../common/enums';

export enum LabTestStatus {
  DRAFT = 'draft',
  RUNNING = 'running',
  ENDED = 'ended',
}

@Entity('lab_tests')
export class LabTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: LabTestType })
  type: LabTestType;

  @Column({ type: 'enum', enum: LabTestStatus, default: LabTestStatus.DRAFT })
  status: LabTestStatus;

  @Column({ type: 'timestamptz' })
  startTime: Date;

  @Column({ type: 'timestamptz' })
  endTime: Date;

  @Column({ type: 'float', nullable: true })
  totalMarks: number | null;

  @ManyToOne(() => Course, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  course: Course;

  @Column()
  courseId: string;

  @OneToMany(() => LabTestProblem, (p) => p.labTest, { cascade: true })
  problems: LabTestProblem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
