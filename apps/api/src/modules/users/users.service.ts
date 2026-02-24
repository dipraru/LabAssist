import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Student } from './entities/student.entity';
import { Teacher } from './entities/teacher.entity';
import { TempJudge } from './entities/temp-judge.entity';
import { TempParticipant } from './entities/temp-participant.entity';
import { UserRole } from '../../common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(TempJudge) private judgeRepo: Repository<TempJudge>,
    @InjectRepository(TempParticipant) private participantRepo: Repository<TempParticipant>,
  ) {}

  async findUserByUsername(username: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { username }, select: ['id', 'username', 'password', 'role', 'isActive', 'isFirstLogin', 'expiresAt', 'passwordChangeSuggested'] });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findStudentByUserId(userId: string): Promise<Student | null> {
    return this.studentRepo.findOne({ where: { userId } });
  }

  async findTeacherByUserId(userId: string): Promise<Teacher | null> {
    return this.teacherRepo.findOne({ where: { userId } });
  }

  async findJudgeByUserId(userId: string): Promise<TempJudge | null> {
    return this.judgeRepo.findOne({ where: { userId } });
  }

  async findParticipantByUserId(userId: string): Promise<TempParticipant | null> {
    return this.participantRepo.findOne({ where: { userId } });
  }

  async getProfileByUserId(userId: string, role: UserRole) {
    switch (role) {
      case UserRole.STUDENT:
        return this.studentRepo.findOne({ where: { userId }, relations: ['user'] });
      case UserRole.TEACHER:
        return this.teacherRepo.findOne({ where: { userId }, relations: ['user'] });
      case UserRole.TEMP_JUDGE:
        return this.judgeRepo.findOne({ where: { userId }, relations: ['user'] });
      case UserRole.TEMP_PARTICIPANT:
        return this.participantRepo.findOne({ where: { userId }, relations: ['user'] });
      default:
        return null;
    }
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    await this.userRepo.update(id, updates);
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateStudent(userId: string, updates: Partial<Student>): Promise<Student> {
    const student = await this.studentRepo.findOne({ where: { userId } });
    if (!student) throw new NotFoundException('Student not found');
    Object.assign(student, updates);
    return this.studentRepo.save(student);
  }

  async updateTeacher(userId: string, updates: Partial<Teacher>): Promise<Teacher> {
    const teacher = await this.teacherRepo.findOne({ where: { userId } });
    if (!teacher) throw new NotFoundException('Teacher not found');
    Object.assign(teacher, updates);
    return this.teacherRepo.save(teacher);
  }
}
