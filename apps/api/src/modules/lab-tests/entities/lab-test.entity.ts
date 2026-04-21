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
import { LabClass } from '../../courses/entities/lab-class.entity';
import { LabTestProblem } from './lab-test-problem.entity';
import { LabTestType } from '../../../common/enums';

export enum LabActivityKind {
  LAB_TEST = 'lab_test',
  LAB_TASK = 'lab_task',
}

export enum LabTestStatus {
  DRAFT = 'draft',
  RUNNING = 'running',
  ENDED = 'ended',
}

export type LabTestHelpMaterial = {
  id: string;
  fileName: string;
  url: string;
  uploadedAt: string;
};

@Entity('lab_tests')
export class LabTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: LabActivityKind,
    default: LabActivityKind.LAB_TEST,
  })
  activityKind: LabActivityKind;

  @Column({ type: 'enum', enum: LabTestType })
  type: LabTestType;

  @Column({ type: 'enum', enum: LabTestStatus, default: LabTestStatus.DRAFT })
  status: LabTestStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startTime: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endTime: Date | null;

  @Column({ type: 'int', nullable: true })
  durationMinutes: number | null;

  @Column({ type: 'float', nullable: true })
  totalMarks: number | null;

  @Column({ type: 'varchar', nullable: true })
  sectionName: string | null;

  @Column({ type: 'boolean', default: true })
  proctoringEnabled: boolean;

  @Column({ type: 'jsonb', default: '[]' })
  helpMaterials: LabTestHelpMaterial[];

  @ManyToOne(() => Course, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  course: Course;

  @Column()
  courseId: string;

  @ManyToOne(() => LabClass, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn()
  labClass: LabClass | null;

  @Column({ type: 'uuid', nullable: true })
  labClassId: string | null;

  @OneToMany(() => LabTestProblem, (p) => p.labTest, { cascade: true })
  problems: LabTestProblem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
