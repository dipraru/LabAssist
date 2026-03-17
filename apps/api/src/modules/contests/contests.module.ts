import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contest } from './entities/contest.entity';
import { Problem } from './entities/problem.entity';
import { ContestProblem } from './entities/contest-problem.entity';
import { ContestSubmission } from './entities/contest-submission.entity';
import { ContestAnnouncement } from './entities/contest-announcement.entity';
import { ContestClarification } from './entities/contest-clarification.entity';
import { User } from '../users/entities/user.entity';
import { TempJudge } from '../users/entities/temp-judge.entity';
import { TempParticipant } from '../users/entities/temp-participant.entity';
import { ContestsService } from './contests.service';
import { ContestsController } from './contests.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contest, Problem, ContestProblem, ContestSubmission,
      ContestAnnouncement, ContestClarification, User, TempJudge, TempParticipant,
    ]),
  ],
  providers: [ContestsService],
  controllers: [ContestsController],
  exports: [ContestsService],
})
export class ContestsModule {}
