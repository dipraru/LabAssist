import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../../common/enums/role.enum';
import {
  CreateLabQuizDto,
  CreateLabQuizQuestionDto,
  GradeLabQuizAttemptDto,
  ReportLabQuizProctoringEventDto,
  SubmitLabQuizDto,
  UpdateLabQuizDto,
  UpdateLabQuizQuestionDto,
} from './dto/lab-quizzes.dto';
import { LabQuizzesService } from './lab-quizzes.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lab-quizzes')
export class LabQuizzesController {
  constructor(private svc: LabQuizzesService) {}

  @Roles(UserRole.TEACHER)
  @Post()
  create(@Body() dto: CreateLabQuizDto, @CurrentUser() user: any) {
    return this.svc.createQuiz(dto, user.id);
  }

  @Roles(UserRole.TEACHER, UserRole.STUDENT)
  @Get('running')
  running(@CurrentUser() user: any) {
    return this.svc.getRunningForUser(user.id, user.role);
  }

  @Roles(UserRole.TEACHER, UserRole.STUDENT)
  @Get('course/:courseId')
  courseQuizzes(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Query('sectionName') sectionName?: string,
  ) {
    return this.svc.getQuizzesByCourse(
      courseId,
      user.id,
      user.role,
      sectionName,
    );
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLabQuizDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateQuiz(id, dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.startQuiz(id, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id/end')
  end(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.endQuiz(id, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Post(':id/questions')
  addQuestion(
    @Param('id') id: string,
    @Body() dto: CreateLabQuizQuestionDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.addQuestion(id, dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id/questions/:questionId')
  updateQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateLabQuizQuestionDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateQuestion(id, questionId, dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Delete(':id/questions/:questionId')
  removeQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.removeQuestion(id, questionId, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Get(':id')
  getForTeacher(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getQuizByIdForTeacher(id, user.id);
  }

  @Roles(UserRole.STUDENT)
  @Get(':id/session')
  session(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getQuizSession(id, user.id);
  }

  @Roles(UserRole.STUDENT)
  @Post(':id/submit')
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitLabQuizDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.submitQuiz(id, user.id, dto);
  }

  @Roles(UserRole.STUDENT)
  @Post(':id/proctoring-events')
  reportProctoring(
    @Param('id') id: string,
    @Body() dto: ReportLabQuizProctoringEventDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.reportProctoringEvent(id, user.id, dto);
  }

  @Roles(UserRole.TEACHER)
  @Get(':id/attempts')
  attempts(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getAttemptsForTeacher(id, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Patch(':id/attempts/:attemptId/grade')
  gradeAttempt(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @Body() dto: GradeLabQuizAttemptDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.gradeAttempt(id, attemptId, dto, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Get(':id/proctoring-events')
  proctoringEvents(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getProctoringEvents(id, user.id);
  }

  @Roles(UserRole.TEACHER)
  @Get(':id/report-pdf')
  reportPdf(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getReportPdf(id, user.id);
  }
}
