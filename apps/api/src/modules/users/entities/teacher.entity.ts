import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum TeacherDesignation {
  LECTURER = 'Lecturer',
  SENIOR_LECTURER = 'Senior Lecturer',
  ASSISTANT_PROFESSOR = 'Assistant Professor',
  ASSOCIATE_PROFESSOR = 'Associate Professor',
  PROFESSOR = 'Professor',
  HEAD_OF_DEPARTMENT = 'Head of Department',
}

@Entity('teachers')
export class Teacher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  teacherId: string; // e.g. T2k1807004

  @Column()
  fullName: string;

  @Column({ type: 'enum', enum: TeacherDesignation })
  designation: TeacherDesignation;

  @Column()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ default: 'Computer Science and Engineering' })
  department: string;

  @Column({ type: 'varchar', nullable: true })
  profilePhoto: string | null;

  @OneToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
