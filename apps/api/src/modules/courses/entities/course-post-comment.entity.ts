import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../../common/enums/role.enum';
import { CoursePost } from './course-post.entity';

@Entity('course_post_comments')
export class CoursePostComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CoursePost, (post) => post.comments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  post: CoursePost;

  @Column()
  postId: string;

  @Column({ type: 'text' })
  body: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  commentedByUser: User;

  @Column()
  commentedByUserId: string;

  @Column({ type: 'enum', enum: UserRole })
  commentedByRole: UserRole;

  @Column()
  commentedByName: string;

  @CreateDateColumn()
  createdAt: Date;
}
