import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LabQuiz } from './lab-quiz.entity';

export enum LabQuizQuestionType {
  MCQ = 'mcq',
  SHORT_ANSWER = 'short_answer',
}

export type LabQuizOption = {
  id: string;
  text: string;
};

@Entity('lab_quiz_questions')
export class LabQuizQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LabQuiz, (quiz) => quiz.questions, { onDelete: 'CASCADE' })
  @JoinColumn()
  quiz: LabQuiz;

  @Column()
  quizId: string;

  @Column({
    type: 'enum',
    enum: LabQuizQuestionType,
    default: LabQuizQuestionType.MCQ,
  })
  questionType: LabQuizQuestionType;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  options: LabQuizOption[];

  @Column({ type: 'varchar', nullable: true })
  correctOptionId: string | null;

  @Column({ type: 'text', nullable: true })
  answerKey: string | null;

  @Column({ type: 'float', default: 1 })
  marks: number;

  @Column({ type: 'int', default: 1 })
  orderIndex: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
