import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { TempJudge } from './entities/temp-judge.entity';
import { TempParticipant } from './entities/temp-participant.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, TempJudge, TempParticipant])],
  providers: [UsersService],
  controllers: [],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
