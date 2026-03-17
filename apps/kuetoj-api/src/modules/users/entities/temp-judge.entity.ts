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

@Entity('temp_judges')
export class TempJudge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column({ unique: true })
  judgeId: string; // auto-generated unique id like TJ-2024-001

  @Column({ type: 'timestamptz' })
  accessFrom: Date;

  @Column({ type: 'timestamptz' })
  accessUntil: Date;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', nullable: true })
  latestIssuedPassword: string | null;

  @OneToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  // Created by office
  @Column({ type: 'varchar', nullable: true })
  createdByOfficeId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
