import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum NotificationType {
  ASSIGNMENT_POSTED = 'assignment_posted',
  LECTURE_SHEET_POSTED = 'lecture_sheet_posted',
  CONTEST_ANNOUNCEMENT = 'contest_announcement',
  SYSTEM = 'system',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  recipientUserId: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', nullable: true })
  referenceId: string | null; // e.g. assignmentId, contestId

  @Column({ default: false })
  isRead: boolean;

  @Column({ default: false })
  emailSent: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
