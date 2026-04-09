import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Semester } from './semester.entity';
import { Teacher } from '../../users/entities/teacher.entity';
import { Enrollment } from './enrollment.entity';
import { LabSchedule } from './lab-schedule.entity';
import { CoursePost } from './course-post.entity';

export enum CourseType {
  THEORY = 'theory',
  LAB = 'lab',
}

@Entity('courses')
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  courseCode: string; // e.g. CSE-2101

  @Column()
  title: string;

  @Column({ type: 'enum', enum: CourseType })
  type: CourseType;

  @Column({ default: 3 })
  creditHours: number;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Semester, (semester) => semester.courses, {
    eager: true,
    nullable: false,
  })
  @JoinColumn()
  semester: Semester;

  @Column()
  semesterId: string;

  @ManyToMany(() => Teacher, { eager: true })
  @JoinTable({
    name: 'course_teachers',
    joinColumn: { name: 'courseId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'teacherId', referencedColumnName: 'id' },
  })
  teachers: Teacher[];

  @OneToMany(() => Enrollment, (e) => e.course)
  enrollments: Enrollment[];

  @OneToMany(() => LabSchedule, (s) => s.course)
  schedules: LabSchedule[];

  @OneToMany(() => CoursePost, (post) => post.course)
  posts: CoursePost[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
