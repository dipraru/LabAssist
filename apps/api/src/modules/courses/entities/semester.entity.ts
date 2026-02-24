import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { SemesterName } from '../../../common/enums';
import { Course } from './course.entity';

@Entity('semesters')
export class Semester {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: SemesterName })
  name: SemesterName; // semester_1 through semester_8

  @Column()
  batchYear: string; // e.g. '21' for 2k21 batch

  @Column({ type: 'date', nullable: true })
  startDate: Date | null;

  @Column({ type: 'date', nullable: true })
  endDate: Date | null;

  @Column({ default: false })
  isCurrent: boolean;

  @OneToMany(() => Course, (course) => course.semester)
  courses: Course[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
