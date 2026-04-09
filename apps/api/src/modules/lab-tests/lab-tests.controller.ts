import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { LabTestsService } from './lab-tests.service';
import {
  CreateLabTestDto,
  JudgeResultCallbackDto,
  ManualGradeDto,
  SubmitLabCodeDto,
} from './dto/lab-tests.dto';
import { LabTestStatus } from './entities/lab-test.entity';
import { SubmissionStatus } from '../../common/enums';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lab-tests')
export class LabTestsController {
  constructor(private svc: LabTestsService) {}

  // ─── TEACHER ────────────────────────────────────────────────────────────────

  @Roles(UserRole.TEACHER)
  @Post()
  create(@Body() dto: CreateLabTestDto, @CurrentUser() user: any) {
    return this.svc.createLabTest(dto, user.userId);
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: LabTestStatus,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateLabTestStatus(id, status, user.userId);
  }

  @Roles(UserRole.TEACHER)
  @Get('course/:courseId')
  getByCourse(@Param('courseId') courseId: string) {
    return this.svc.getLabTestsByCourse(courseId);
  }

  @Roles(UserRole.TEACHER)
  @Get(':id/submissions')
  getAllSubmissions(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getAllSubmissionsForLabTest(id, user.userId);
  }

  @Roles(UserRole.TEACHER)
  @Get('problems/:problemId/submissions')
  getSubmissionsForProblem(
    @Param('problemId') pId: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.getSubmissionsForProblem(pId, user.userId);
  }

  @Roles(UserRole.TEACHER)
  @Patch('submissions/:id/grade')
  grade(
    @Param('id') id: string,
    @Body() dto: ManualGradeDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.gradeSubmission(id, dto, user.userId);
  }

  // ─── STUDENT ────────────────────────────────────────────────────────────────

  @Roles(UserRole.STUDENT)
  @Get('running')
  getRunning(@CurrentUser() user: any) {
    return this.svc.getRunningLabTestsForStudent(user.userId);
  }

  @Roles(UserRole.STUDENT)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.svc.getLabTestById(id);
  }

  @Roles(UserRole.STUDENT)
  @Get(':id/problems')
  getProblems(@Param('id') id: string) {
    return this.svc.getProblemsForStudent(id);
  }

  @Roles(UserRole.STUDENT)
  @Post('problems/:problemId/submit')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  submit(
    @Param('problemId') pId: string,
    @Body() dto: SubmitLabCodeDto,
    @CurrentUser() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.svc.submitCode(pId, user.userId, dto, file);
  }

  @Roles(UserRole.STUDENT)
  @Get('problems/:problemId/my-submissions')
  mySubmissions(@Param('problemId') pId: string, @CurrentUser() user: any) {
    return this.svc.getMySubmissionsForProblem(pId, user.userId);
  }

  // ─── JUDGE WEBHOOK (future integration) ─────────────────────────────────────

  /** Called by automated judge — no auth guard on purpose (token-based via judgeToken) */
  @Patch('submissions/:id/result')
  async judgeResult(
    @Param('id') id: string,
    @Body() body: JudgeResultCallbackDto,
  ) {
    return this.svc.receiveJudgeResult(
      id,
      body.verdict as unknown as SubmissionStatus,
      body.executionTimeMs,
      body.memoryUsedKb,
    );
  }
}
