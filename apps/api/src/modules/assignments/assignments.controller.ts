import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssignmentsService } from './assignments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  GradeSubmissionDto,
} from './dto/assignments.dto';

@UseGuards(JwtAuthGuard)
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @Post()
  create(
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.assignmentsService.createAssignment(dto, user.id);
  }

  @Get('course/:courseId')
  getByCourse(@Param('courseId') courseId: string) {
    return this.assignmentsService.getAssignmentsByCourse(courseId);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.assignmentsService.getAssignmentById(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.assignmentsService.updateAssignment(id, dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.STUDENT)
  @Post(':id/submit')
  @UseInterceptors(FileInterceptor('file'))
  submitAssignment(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
    @Body('notes') notes?: string,
  ) {
    return this.assignmentsService.submitAssignment(id, user.id, file, notes);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @Get(':id/submissions')
  getSubmissions(@Param('id') id: string) {
    return this.assignmentsService.getSubmissionsForAssignment(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.STUDENT)
  @Get(':id/my-submission')
  getMySubmission(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.assignmentsService.getMySubmission(id, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.TEACHER)
  @Patch('submissions/:submissionId/grade')
  grade(
    @Param('submissionId') submissionId: string,
    @Body() dto: GradeSubmissionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.assignmentsService.gradeSubmission(submissionId, dto, user.id);
  }
}
