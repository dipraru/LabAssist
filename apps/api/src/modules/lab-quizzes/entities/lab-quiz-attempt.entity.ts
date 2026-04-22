import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Student } from '../../users/entities/student.entity';
import { LabQuiz } from './lab-quiz.entity';

export type LabQuizAttemptAnswer = {
  questionId: string;
  selectedOptionId?: string | null;
  answerText?: string | null;
  score?: number | null;
  evaluated?: boolean;
  teacherNote?: string | null;
  evaluatedAt?: string | null;
  evaluatedById?: string | null;
};

@Entity('lab_quiz_attempts')
@Unique(['quizId', 'studentId'])
export class LabQuizAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LabQuiz, (quiz) => quiz.attempts, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  quiz: LabQuiz;

  @Column()
  quizId: string;

  @ManyToOne(() => Student, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  student: Student;

  @Column()
  studentId: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  questionOrder: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  answers: LabQuizAttemptAnswer[];

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'float', nullable: true })
  mcqScore: number | null;

  @Column({ type: 'float', nullable: true })
  shortScore: number | null;

  @Column({ type: 'float', nullable: true })
  totalScore: number | null;

  @Column({ type: 'boolean', default: false })
  evaluationComplete: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
