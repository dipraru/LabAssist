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
import { LabClass } from './lab-class.entity';

// Lecture sheets are links posted by teachers for a course
@Entity('lecture_sheets')
export class LectureSheet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  links: { url: string; label: string }[];

  @ManyToOne(() => Course, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  course: Course;

  @Column()
  courseId: string;

  @ManyToOne(() => Teacher, { eager: true, nullable: true })
  @JoinColumn()
  postedBy: Teacher | null;

  @Column({ type: 'varchar', nullable: true })
  postedById: string | null;

  @ManyToOne(() => LabClass, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  labClass: LabClass | null;

  @Column({ type: 'varchar', nullable: true })
  labClassId: string | null;

  @Column({ type: 'varchar', nullable: true })
  sectionName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
