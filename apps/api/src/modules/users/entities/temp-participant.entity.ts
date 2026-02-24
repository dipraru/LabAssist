import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';
import { Contest } from '../../contests/entities/contest.entity';

@Entity('temp_participants')
export class TempParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column({ unique: true })
  participantId: string; // auto-generated like TP-001

  // Which contest this participant is created for
  @ManyToOne(() => Contest, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  contest: Contest | null;

  @Column({ type: 'varchar', nullable: true })
  contestId: string | null;

  @Column({ type: 'timestamptz' })
  accessFrom: Date;

  @Column({ type: 'timestamptz' })
  accessUntil: Date;

  @OneToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  // Created by judge
  @Column({ type: 'varchar', nullable: true })
  createdByJudgeId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
