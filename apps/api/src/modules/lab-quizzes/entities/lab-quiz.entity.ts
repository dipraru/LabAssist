import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { LabClass } from '../../courses/entities/lab-class.entity';
import { LabQuizQuestion } from './lab-quiz-question.entity';
import { LabQuizAttempt } from './lab-quiz-attempt.entity';

export enum LabQuizStatus {
  DRAFT = 'draft',
  RUNNING = 'running',
  ENDED = 'ended',
}

export enum LabQuizQuestionDisplayMode {
  ALL = 'all',
  ONE_BY_ONE = 'one_by_one',
}

@Entity('lab_quizzes')
export class LabQuiz {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: LabQuizStatus, default: LabQuizStatus.DRAFT })
  status: LabQuizStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startTime: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endTime: Date | null;

  @Column({ type: 'int' })
  durationMinutes: number;

  @Column({ type: 'float', nullable: true })
  totalMarks: number | null;

  @Column({ type: 'varchar', nullable: true })
  sectionName: string | null;

  @Column({
    type: 'enum',
    enum: LabQuizQuestionDisplayMode,
    default: LabQuizQuestionDisplayMode.ALL,
  })
  questionDisplayMode: LabQuizQuestionDisplayMode;

  @Column({ type: 'boolean', default: true })
  proctoringEnabled: boolean;

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

  @OneToMany(() => LabQuizQuestion, (question) => question.quiz, {
    cascade: true,
  })
  questions: LabQuizQuestion[];

  @OneToMany(() => LabQuizAttempt, (attempt) => attempt.quiz)
  attempts: LabQuizAttempt[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
