import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Contest } from './contest.entity';

@Entity('contest_announcements')
export class ContestAnnouncement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @ManyToOne(() => Contest, (c) => c.announcements, { onDelete: 'CASCADE' })
  @JoinColumn()
  contest: Contest;

  @Column()
  contestId: string;

  @Column({ type: 'varchar', nullable: true })
  authorId: string | null;

  @Column({ default: false })
  isPinned: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
