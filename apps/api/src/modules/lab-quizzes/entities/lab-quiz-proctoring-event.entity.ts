import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Student } from '../../users/entities/student.entity';
import { LabProctoringEventType } from '../../lab-tests/entities/lab-proctoring-event.entity';
import { LabQuiz } from './lab-quiz.entity';

@Entity('lab_quiz_proctoring_events')
export class LabQuizProctoringEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LabQuiz, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  quiz: LabQuiz;

  @Column()
  quizId: string;

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
  questionId: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
