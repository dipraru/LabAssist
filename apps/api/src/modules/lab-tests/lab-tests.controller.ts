import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { LabTestsService } from './lab-tests.service';
import {
  CreateProblemDto,
  CreateLabTestDto,
  ImportProblemDto,
  JudgeResultCallbackDto,
  ManualGradeDto,
  ReportLabProctoringEventDto,
  RunLabCodeDto,
  SubmitLabCodeDto,
  UpdateLabActivityProblemDto,
  UpdateLabTestDto,
  UpdateProblemBankDto,
} from './dto/lab-tests.dto';
import { LabActivityKind, LabTestStatus } from './entities/lab-test.entity';
import { SubmissionStatus } from '../../common/enums';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lab-tests')
export class LabTestsController {
  constructor(private svc: LabTestsService) {}

  // ─── TEACHER ────────────────────────────────────────────────────────────────

  @Roles(UserRole.TEACHER)
  @Post()
  create(@Body() dto: CreateLabTestDto, @CurrentUser() user: any) {
    return this.svc.createLabTest(dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLabTestDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateLabTest(id, dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: LabTestStatus,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateLabTestStatus(id, status, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.startLabTest(id, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id/end')
  end(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.endLabTest(id, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Post(':id/help-materials/upload')
  @UseInterceptors(FilesInterceptor('files', 8, { storage: memoryStorage() }))
  uploadHelpMaterials(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.svc.uploadHelpMaterials(id, user.id, files ?? []);
  }

  @Roles(UserRole.TEACHER, UserRole.STUDENT)
  @Get('course/:courseId')
  getByCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Query('kind') kind?: LabActivityKind,
    @Query('sectionName') sectionName?: string,
    @Query('labClassId') labClassId?: string,
  ) {
    return this.svc.getLabTestsByCourse(
      courseId,
      user.id,
      user.role,
      kind,
      sectionName,
      labClassId,
    );
  }

  @Roles(UserRole.TEACHER)
  @Get('problem-bank')
  problemBank(@CurrentUser() user: any) {
    return this.svc.listReusableProblems(user.id);
  }

  @Roles(UserRole.TEACHER)
  @Post('problem-bank')
  createProblemBankEntry(
    @Body() dto: CreateProblemDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.createReusableProblem(dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Get('problem-bank/:id')
  getProblemBankEntry(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getReusableProblemById(id, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch('problem-bank/:id')
  updateProblemBankEntry(
    @Param('id') id: string,
    @Body() dto: UpdateProblemBankDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateReusableProblem(id, dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Post(':id/problems')
  addProblem(
    @Param('id') id: string,
    @Body() dto: CreateProblemDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.addProblem(id, dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Post(':id/problems/import')
  importProblem(
    @Param('id') id: string,
    @Body() dto: ImportProblemDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.importProblem(id, dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Delete(':id/problems/:problemId')
  removeProblem(
    @Param('id') id: string,
    @Param('problemId') problemId: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.removeProblem(id, problemId, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id/problems/:problemId')
  updateActivityProblem(
    @Param('id') id: string,
    @Param('problemId') problemId: string,
    @Body() dto: UpdateLabActivityProblemDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateActivityProblem(id, problemId, dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Get(':id/submissions')
  getAllSubmissions(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getAllSubmissionsForLabTest(id, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Get(':id/proctoring-events')
  getProctoringEvents(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getProctoringEventsForLabTest(id, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Get('problems/:problemId/submissions')
  getSubmissionsForProblem(
    @Param('problemId') pId: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.getSubmissionsForProblem(pId, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch('submissions/:id/grade')
  grade(
    @Param('id') id: string,
    @Body() dto: ManualGradeDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.gradeSubmission(id, dto, user.id);
  }

  // ─── STUDENT ────────────────────────────────────────────────────────────────

  @Roles(UserRole.STUDENT)
  @Get('running')
  getRunning(@CurrentUser() user: any) {
    return this.svc.getRunningLabTestsForStudent(user.id);
  }

  @Roles(UserRole.TEACHER, UserRole.STUDENT)
  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user: any) {
    if (user.role === UserRole.TEACHER) {
      return this.svc.getLabTestByIdForTeacher(id, user.id);
    }
    return this.svc.getLabTestByIdForStudent(id, user.id);
  }

  @Roles(UserRole.TEACHER, UserRole.STUDENT)
  @Get(':id/problems')
  getProblems(@Param('id') id: string, @CurrentUser() user: any) {
    if (user.role === UserRole.TEACHER) {
      return this.svc.getProblemsForTeacher(id, user.id);
    }
    return this.svc.getProblemsForStudent(id, user.id);
  }

  @Roles(UserRole.STUDENT)
  @Post('problems/:problemId/run')
  run(
    @Param('problemId') pId: string,
    @Body() dto: RunLabCodeDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.runCode(pId, user.id, dto);
  }

  @Roles(UserRole.STUDENT)
  @Post(':labTestId/problems/:problemId/run')
  runFromLabTest(
    @Param('problemId') pId: string,
    @Body() dto: RunLabCodeDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.runCode(pId, user.id, dto);
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
    return this.svc.submitCode(pId, user.id, dto, file);
  }

  @Roles(UserRole.STUDENT)
  @Post(':labTestId/problems/:problemId/submit')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  submitFromLabTest(
    @Param('problemId') pId: string,
    @Body() dto: SubmitLabCodeDto,
    @CurrentUser() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.svc.submitCode(pId, user.id, dto, file);
  }

  @Roles(UserRole.STUDENT)
  @Get('problems/:problemId/my-submissions')
  mySubmissions(@Param('problemId') pId: string, @CurrentUser() user: any) {
    return this.svc.getMySubmissionsForProblem(pId, user.id);
  }

  @Roles(UserRole.STUDENT)
  @Get(':id/my-submissions')
  mySubmissionsForLabTest(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getMySubmissionsForLabTest(id, user.id);
  }

  @Roles(UserRole.STUDENT)
  @Post(':id/proctoring-events')
  reportProctoringEvent(
    @Param('id') id: string,
    @Body() dto: ReportLabProctoringEventDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.reportProctoringEvent(id, user.id, dto);
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
