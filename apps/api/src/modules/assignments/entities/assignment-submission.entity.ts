import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Assignment } from './assignment.entity';
import { Student } from '../../users/entities/student.entity';

export enum AssignmentSubmissionStatus {
  SUBMITTED = 'submitted',
  LATE = 'late',
  GRADED = 'graded',
  RESUBMITTED = 'resubmitted',
}

@Entity('assignment_submissions')
@Unique(['assignmentId', 'studentId'])
export class AssignmentSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Assignment, (a) => a.submissions, { onDelete: 'CASCADE' })
  @JoinColumn()
  assignment: Assignment;

  @Column()
  assignmentId: string;

  @ManyToOne(() => Student, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  student: Student;

  @Column()
  studentId: string;

  @Column({ type: 'varchar', nullable: true })
  fileUrl: string | null; // path on server

  @Column({ type: 'varchar', nullable: true })
  fileName: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: AssignmentSubmissionStatus,
    default: AssignmentSubmissionStatus.SUBMITTED,
  })
  status: AssignmentSubmissionStatus;

  @Column({ type: 'float', nullable: true })
  score: number | null;

  @Column({ type: 'text', nullable: true })
  feedback: string | null;

  @Column({ type: 'varchar', nullable: true })
  gradedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  gradedAt: Date | null;

  @CreateDateColumn()
  submittedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
