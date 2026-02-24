import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LabTest } from './entities/lab-test.entity';
import { LabTestProblem } from './entities/lab-test-problem.entity';
import { LabSubmission } from './entities/lab-submission.entity';
import { LabTestsService } from './lab-tests.service';
import { LabTestsController } from './lab-tests.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LabTest, LabTestProblem, LabSubmission])],
  providers: [LabTestsService],
  controllers: [LabTestsController],
  exports: [LabTestsService],
})
export class LabTestsModule {}
