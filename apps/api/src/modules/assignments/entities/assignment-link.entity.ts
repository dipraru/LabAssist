import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Assignment } from './assignment.entity';

@Entity('assignment_links')
export class AssignmentLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  url: string;

  @Column({ type: 'varchar', nullable: true })
  label: string | null;

  @ManyToOne(() => Assignment, (a) => a.links, { onDelete: 'CASCADE' })
  @JoinColumn()
  assignment: Assignment;

  @Column()
  assignmentId: string;
}
