import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum';

export enum ProfileChangeApplicationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export type ProfileChangeFieldMap = Record<string, string | null>;

@Entity('profile_change_applications')
export class ProfileChangeApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  requesterUserId: string;

  @Column({ type: 'enum', enum: UserRole })
  requesterRole: UserRole;

  @Column()
  requesterName: string;

  @Column({ type: 'varchar', nullable: true })
  requesterIdentifier: string | null;

  @Column({ type: 'varchar', nullable: true })
  requesterPhoto: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  currentData: ProfileChangeFieldMap;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  requestedData: ProfileChangeFieldMap;

  @Column({ type: 'varchar', nullable: true })
  requestedPhoto: string | null;

  @Column({
    type: 'enum',
    enum: ProfileChangeApplicationStatus,
    default: ProfileChangeApplicationStatus.PENDING,
  })
  status: ProfileChangeApplicationStatus;

  @Column({ type: 'varchar', nullable: true })
  reviewedByOfficeId: string | null;

  @Column({ type: 'varchar', nullable: true })
  reviewedByName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
