import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LabClass } from './lab-class.entity';

export enum LabClassSectionStatus {
  PENDING = 'pending',
  CONDUCTED = 'conducted',
}

export type LabAttendanceRecord = {
  studentId: string;
  isPresent: boolean;
  addedAsExtra?: boolean;
};

@Entity('lab_class_sections')
export class LabClassSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LabClass, (labClass) => labClass.sections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  labClass: LabClass;

  @Column()
  labClassId: string;

  @Column()
  sectionName: string;

  @Column({
    type: 'enum',
    enum: LabClassSectionStatus,
    default: LabClassSectionStatus.PENDING,
  })
  status: LabClassSectionStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  attendanceRecords: LabAttendanceRecord[];

  @Column({ type: 'date', nullable: true })
  scheduledDate: Date | null;

  @Column({ type: 'time', nullable: true })
  scheduledStartTime: string | null;

  @Column({ type: 'time', nullable: true })
  scheduledEndTime: string | null;

  @Column({ type: 'varchar', nullable: true })
  roomNumber: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  attendanceTakenAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  conductedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
