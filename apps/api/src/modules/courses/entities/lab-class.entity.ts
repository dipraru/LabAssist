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
import { Course } from './course.entity';
import { Teacher } from '../../users/entities/teacher.entity';
import { LabClassSection } from './lab-class-section.entity';

@Entity('lab_classes')
export class LabClass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int' })
  labNumber: number;

  @Column({ type: 'date' })
  classDate: Date;

  @ManyToOne(() => Course, (course) => course.labClasses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  course: Course;

  @Column()
  courseId: string;

  @ManyToOne(() => Teacher, { eager: true, nullable: true })
  @JoinColumn()
  createdBy: Teacher | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  @OneToMany(() => LabClassSection, (section) => section.labClass, {
    cascade: true,
  })
  sections: LabClassSection[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
