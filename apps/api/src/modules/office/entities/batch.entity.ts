import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

export type BatchSection = {
  name: string;
  fromStudentId: string;
  toStudentId: string;
};

@Entity('batches')
@Unique(['year'])
export class Batch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  year: string;

  @Column({ type: 'int', default: 1 })
  sectionCount: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  sections: BatchSection[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
