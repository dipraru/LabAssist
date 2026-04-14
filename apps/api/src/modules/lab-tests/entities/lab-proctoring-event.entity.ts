import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LabTest } from './lab-test.entity';
import { Student } from '../../users/entities/student.entity';

export enum LabProctoringEventType {
  FULLSCREEN_EXIT = 'fullscreen_exit',
  TAB_HIDDEN = 'tab_hidden',
  WINDOW_BLUR = 'window_blur',
  COPY_BLOCKED = 'copy_blocked',
  PASTE_BLOCKED = 'paste_blocked',
  CUT_BLOCKED = 'cut_blocked',
}

@Entity('lab_proctoring_events')
export class LabProctoringEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LabTest, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  labTest: LabTest;

  @Column()
  labTestId: string;

  @ManyToOne(() => Student, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  student: Student;

  @Column()
  studentId: string;

  @Column({
    type: 'enum',
    enum: LabProctoringEventType,
  })
  eventType: LabProctoringEventType;

  @Column({ type: 'varchar', nullable: true })
  problemId: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
