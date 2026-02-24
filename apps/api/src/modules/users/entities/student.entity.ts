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

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  studentId: string; // e.g. 2107070

  @Column()
  batchYear: string; // e.g. '21' parsed from studentId

  @Column()
  deptCode: string; // e.g. '07' parsed from studentId

  @Column()
  rollNumber: string; // last 3 digits

  @Column({ type: 'varchar', nullable: true })
  fullName: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  guardianPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  fathersName: string | null;

  @Column({ type: 'varchar', nullable: true })
  mothersName: string | null;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ type: 'varchar', nullable: true })
  presentAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  permanentAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  profilePhoto: string | null;

  @Column({ default: 'Computer Science and Engineering' })
  department: string;

  @Column({ default: false })
  profileCompleted: boolean;

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
