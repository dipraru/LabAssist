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
import { Teacher } from '../../users/entities/teacher.entity';
import { AssignmentLink } from './assignment-link.entity';
import { AssignmentSubmission } from './assignment-submission.entity';
import { AssignmentStatus } from '../../../common/enums';

@Entity('assignments')
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  caption: string | null;

  @Column({ type: 'enum', enum: AssignmentStatus, default: AssignmentStatus.DRAFT })
  status: AssignmentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  deadline: Date | null;

  @Column({ default: true })
  allowLateSubmission: boolean;

  @Column({ type: 'float', nullable: true })
  totalMarks: number | null;

  @ManyToOne(() => Course, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  course: Course;

  @Column()
  courseId: string;

  @ManyToOne(() => Teacher, { eager: true, nullable: true })
  @JoinColumn()
  createdBy: Teacher | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  @OneToMany(() => AssignmentLink, (l) => l.assignment, { cascade: true, eager: true })
  links: AssignmentLink[];

  @OneToMany(() => AssignmentSubmission, (s) => s.assignment)
  submissions: AssignmentSubmission[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
