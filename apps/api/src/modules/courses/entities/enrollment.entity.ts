import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Course } from './course.entity';
import { Student } from '../../users/entities/student.entity';

@Entity('enrollments')
@Unique(['courseId', 'studentId'])
export class Enrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Course, (course) => course.enrollments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  course: Course;

  @Column()
  courseId: string;

  @ManyToOne(() => Student, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  student: Student;

  @Column()
  studentId: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  enrolledAt: Date;
}
