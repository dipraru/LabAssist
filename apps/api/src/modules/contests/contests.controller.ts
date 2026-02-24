import {
  Body, Controller, Get, Param, Patch, Post, UploadedFiles,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { ContestsService } from './contests.service';
import {
  AddContestProblemDto, AnswerClarificationDto, AskClarificationDto,
  ContestJudgeResultDto, ContestSubmitDto, CreateAnnouncementDto,
  CreateContestDto, CreateProblemDto, CreateTempParticipantsDto,
  GradeContestSubmissionDto,
} from './dto/contests.dto';
import { ContestStatus } from '../../common/enums';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contests')
export class ContestsController {
  constructor(private svc: ContestsService) {}

  // ─── PUBLIC / ALL ROLES ──────────────────────────────────────────────────────

  @Get()
  listContests() { return this.svc.listContests(); }

  @Get(':id')
  getById(@Param('id') id: string) { return this.svc.getContestById(id); }

  @Get(':id/standings')
  standings(@Param('id') id: string, @CurrentUser() user: any) {
    const isJudge = user.role === UserRole.TEMP_JUDGE;
    return this.svc.getStandings(id, isJudge ? user.userId : undefined);
  }

  @Get(':id/announcements')
  announcements(@Param('id') id: string) { return this.svc.getAnnouncements(id); }

  // ─── JUDGE: PROBLEM BANK ─────────────────────────────────────────────────────

  @Roles(UserRole.TEMP_JUDGE)
  @Post('problems')
  createProblem(@Body() dto: CreateProblemDto, @CurrentUser() user: any) {
    return this.svc.createProblem(dto, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Get('problems/mine')
  myProblems(@CurrentUser() user: any) {
    return this.svc.listMyProblems(user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Get('problems/:id')
  getProblem(@Param('id') id: string) {
    return this.svc.getProblemById(id);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Patch('problems/:id')
  updateProblem(@Param('id') id: string, @Body() dto: Partial<CreateProblemDto>, @CurrentUser() user: any) {
    return this.svc.updateProblem(id, dto, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Post('problems/:id/files')
  @UseInterceptors(FileFieldsInterceptor(
    [{ name: 'inputFile', maxCount: 1 }, { name: 'outputFile', maxCount: 1 }],
    { storage: memoryStorage() },
  ))
  uploadProblemFiles(
    @Param('id') id: string,
    @UploadedFiles() files: { inputFile?: Express.Multer.File[]; outputFile?: Express.Multer.File[] },
    @CurrentUser() user: any,
  ) {
    return this.svc.uploadProblemFile(
      id, user.userId,
      files.inputFile?.[0], files.outputFile?.[0],
    );
  }

  // ─── JUDGE: CONTEST MANAGEMENT ───────────────────────────────────────────────

  @Roles(UserRole.TEMP_JUDGE)
  @Post()
  createContest(@Body() dto: CreateContestDto, @CurrentUser() user: any) {
    return this.svc.createContest(dto, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: ContestStatus,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateContestStatus(id, status, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Post(':id/problems')
  addProblem(
    @Param('id') id: string,
    @Body() dto: AddContestProblemDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.addProblemToContest(id, dto, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Patch(':id/freeze')
  freezeStandings(
    @Param('id') id: string,
    @Body('frozen') frozen: boolean,
    @CurrentUser() user: any,
  ) {
    return this.svc.freezeStandings(id, frozen, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Get(':id/submissions/all')
  allSubmissions(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getAllSubmissions(id, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Patch('submissions/:id/grade')
  grade(@Param('id') id: string, @Body() dto: GradeContestSubmissionDto, @CurrentUser() user: any) {
    return this.svc.gradeSubmission(id, dto, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Post(':id/announcements')
  announce(
    @Param('id') id: string,
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.createAnnouncement(id, dto, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Get(':id/clarifications/pending')
  pendingClarifications(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getPendingClarifications(id, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Patch('clarifications/:id/answer')
  answerClar(@Param('id') id: string, @Body() dto: AnswerClarificationDto, @CurrentUser() user: any) {
    return this.svc.answerClarification(id, dto, user.userId);
  }

  @Roles(UserRole.TEMP_JUDGE)
  @Post('participants/bulk')
  createParticipants(@Body() dto: CreateTempParticipantsDto, @CurrentUser() user: any) {
    return this.svc.createTempParticipants(dto, user.userId);
  }

  // ─── PARTICIPANT / STUDENT: SUBMIT ───────────────────────────────────────────

  @Roles(UserRole.TEMP_PARTICIPANT, UserRole.STUDENT)
  @Post(':id/submit')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  submit(
    @Param('id') contestId: string,
    @Body() dto: ContestSubmitDto,
    @CurrentUser() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.svc.submitSolution(
      contestId, dto, user.userId, user.username, file,
    );
  }

  @Roles(UserRole.TEMP_PARTICIPANT, UserRole.STUDENT)
  @Get(':id/my-submissions')
  mySubmissions(@Param('id') contestId: string, @CurrentUser() user: any) {
    return this.svc.getMySubmissions(contestId, user.userId);
  }

  @Roles(UserRole.TEMP_PARTICIPANT, UserRole.STUDENT)
  @Post(':id/clarifications')
  askClar(
    @Param('id') contestId: string,
    @Body() dto: AskClarificationDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.askClarification(contestId, dto, user.userId);
  }

  @Roles(UserRole.TEMP_PARTICIPANT, UserRole.STUDENT)
  @Get(':id/clarifications/mine')
  myClarifications(@Param('id') contestId: string, @CurrentUser() user: any) {
    return this.svc.getMyClarifications(contestId, user.userId);
  }

  // ─── FUTURE JUDGE WEBHOOK ─────────────────────────────────────────────────────

  @Patch('submissions/:id/result')
  judgeResult(@Param('id') id: string, @Body() dto: ContestJudgeResultDto) {
    return this.svc.receiveJudgeResult(id, dto);
  }
}
