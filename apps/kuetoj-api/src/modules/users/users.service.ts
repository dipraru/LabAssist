import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { TempJudge } from './entities/temp-judge.entity';
import { TempParticipant } from './entities/temp-participant.entity';
import { UserRole } from '../../common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(TempJudge) private judgeRepo: Repository<TempJudge>,
    @InjectRepository(TempParticipant)
    private participantRepo: Repository<TempParticipant>,
  ) {}

  async findUserByUsername(username: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { username },
      select: [
        'id',
        'username',
        'password',
        'role',
        'isActive',
        'isFirstLogin',
        'expiresAt',
        'passwordChangeSuggested',
      ],
    });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findJudgeByUserId(userId: string): Promise<TempJudge | null> {
    return this.judgeRepo.findOne({ where: { userId } });
  }

  async findParticipantByUserId(
    userId: string,
  ): Promise<TempParticipant | null> {
    return this.participantRepo.findOne({ where: { userId } });
  }

  async getProfileByUserId(userId: string, role: UserRole) {
    switch (role) {
      case UserRole.TEMP_JUDGE:
        return this.judgeRepo.findOne({
          where: { userId },
          relations: ['user'],
        });
      case UserRole.TEMP_PARTICIPANT:
        return this.participantRepo.findOne({
          where: { userId },
          relations: ['user'],
        });
      default:
        return null;
    }
  }
}
