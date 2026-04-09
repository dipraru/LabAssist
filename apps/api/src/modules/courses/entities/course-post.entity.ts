import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Course } from './course.entity';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../../common/enums/role.enum';
import { CoursePostComment } from './course-post-comment.entity';

export enum CoursePostType {
  ANNOUNCEMENT = 'announcement',
  DISCUSSION = 'discussion',
  QUESTION = 'question',
}

@Entity('course_posts')
export class CoursePost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Course, (course) => course.posts, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn()
  course: Course;

  @Column()
  courseId: string;

  @Column({ type: 'enum', enum: CoursePostType })
  type: CoursePostType;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  body: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  postedByUser: User;

  @Column()
  postedByUserId: string;

  @Column({ type: 'enum', enum: UserRole })
  postedByRole: UserRole;

  @Column()
  postedByName: string;

  @OneToMany(() => CoursePostComment, (comment) => comment.post, {
    cascade: true,
  })
  comments: CoursePostComment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
