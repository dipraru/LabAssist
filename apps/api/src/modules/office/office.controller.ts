import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Delete,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OfficeService } from './office.service';
import { PdfService } from './pdf.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { StorageService } from '../storage/storage.service';
import { Teacher } from '../users/entities/teacher.entity';
import {
  CreateTeacherDto,
  CreateStudentsBulkDto,
  CreateTempJudgeDto,
  ExtendTempJudgeDto,
  CorrectStudentDto,
  CorrectTeacherDto,
  CreateSemesterDto,
  CreateStudentDto,
  CreateBatchDto,
  UpdateSemesterStartDateDto,
  UpdateProfileChangeApplicationStatusDto,
} from './dto/office.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OFFICE)
@Controller('office')
export class OfficeController {
  constructor(
    private readonly officeService: OfficeService,
    private readonly pdfService: PdfService,
    private readonly storageService: StorageService,
  ) {}

  @Get('dashboard')
  getDashboard() {
    return this.officeService.getDashboardStats();
  }

  // ── Teachers ─────────────────────────────────────────────
  @Post('teachers')
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage() }))
  async createTeacher(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateTeacherDto,
  ) {
    if (!file) {
      throw new BadRequestException('Teacher photo is required');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Teacher photo must be an image');
    }

    const savedPhoto = await this.storageService.saveBuffer(
      file.buffer,
      file.originalname,
      'profiles',
      5 * 1024 * 1024,
    );

    let createResult: { teacher: Teacher; plainPassword: string };
    try {
      createResult = await this.officeService.createTeacher({
        ...dto,
        profilePhoto: savedPhoto.url,
      });
    } catch (error) {
      this.storageService.deleteFile(savedPhoto.filePath);
      throw error;
    }
    const { teacher, plainPassword } = createResult;

    const pdf = await this.pdfService.generateCredentialsPdf([
      {
        username: teacher.teacherId,
        password: plainPassword,
        name: teacher.fullName ?? teacher.teacherId,
      },
    ]);
    return {
      teacher,
      credentials: { username: teacher.teacherId, password: plainPassword },
      credentialsPdf: pdf,
    };
  }

  @Get('teachers')
  getAllTeachers() {
    return this.officeService.getAllTeachers();
  }

  @Post('teachers/:id/credentials/reset')
  async resetTeacherCredentials(@Param('id') id: string) {
    const { teacher, plainPassword } =
      await this.officeService.resetTeacherCredentials(id);
    const pdf = await this.pdfService.generateCredentialsPdf([
      {
        username: teacher.teacherId,
        password: plainPassword,
        name: teacher.fullName ?? teacher.teacherId,
      },
    ]);
    return {
      teacher,
      credentials: { username: teacher.teacherId, password: plainPassword },
      credentialsPdf: pdf,
    };
  }

  @Delete('teachers/:id')
  async deleteTeacher(@Param('id') id: string) {
    await this.officeService.deleteTeacher(id);
    return { success: true };
  }

  @Patch('teachers/correct')
  correctTeacher(@Body() dto: CorrectTeacherDto) {
    return this.officeService.correctTeacherInfo(dto);
  }

  @Patch('users/:userId/toggle-active')
  toggleActive(
    @Param('userId') userId: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.officeService.toggleUserActive(userId, isActive);
  }

  // ── Students ─────────────────────────────────────────────
  @Post('students')
  async createStudent(@Body() dto: CreateStudentDto) {
    const { student, plainPassword } =
      await this.officeService.createStudent(dto);
    const pdf = await this.pdfService.generateCredentialsPdf([
      {
        username: student.studentId,
        password: plainPassword,
        name: student.fullName ?? `Student ${student.studentId}`,
      },
    ]);
    return {
      student,
      credentials: { username: student.studentId, password: plainPassword },
      credentialsPdf: pdf,
    };
  }

  @Post('students/bulk')
  @UseInterceptors(FileInterceptor('file'))
  async createStudentsBulk(
    @UploadedFile() file?: Express.Multer.File,
    @Body() dto?: Partial<CreateStudentsBulkDto>,
  ) {
    if (file) {
      if (!dto?.batchYear) {
        throw new BadRequestException(
          'batchYear is required for CSV bulk import',
        );
      }
      const result = await this.officeService.createStudentsBulkFromCsv(
        file.buffer,
        dto.batchYear,
      );
      const credentialsPdf = await this.pdfService.generateCredentialsPdf(
        result.credentials,
      );
      return { ...result, credentialsPdf };
    }

    if (!dto?.fromStudentId || !dto?.toStudentId || !dto?.batchYear) {
      throw new BadRequestException(
        'Provide a CSV file or a valid student ID range payload',
      );
    }

    const result = await this.officeService.createStudentsBulk(
      dto as CreateStudentsBulkDto,
    );
    const credentialsPdf = await this.pdfService.generateCredentialsPdf(
      result.credentials,
    );
    return { ...result, credentialsPdf };
  }

  @Get('students')
  getAllStudents(@Query('batch') batch?: string) {
    return this.officeService.getAllStudents(batch);
  }

  @Post('students/:id/credentials/reset')
  async resetStudentCredentials(@Param('id') id: string) {
    const { student, plainPassword } =
      await this.officeService.resetStudentCredentials(id);
    const pdf = await this.pdfService.generateCredentialsPdf([
      {
        username: student.studentId,
        password: plainPassword,
        name: student.fullName ?? `Student ${student.studentId}`,
      },
    ]);
    return {
      student,
      credentials: { username: student.studentId, password: plainPassword },
      credentialsPdf: pdf,
    };
  }

  @Delete('students/:id')
  async deleteStudent(@Param('id') id: string) {
    await this.officeService.deleteStudent(id);
    return { success: true };
  }

  @Patch('students/correct')
  correctStudent(@Body() dto: CorrectStudentDto) {
    return this.officeService.correctStudentInfo(dto);
  }

  @Get('profile-change-applications')
  getProfileChangeApplications() {
    return this.officeService.getProfileChangeApplications();
  }

  @Get('profile-change-applications/:id')
  getProfileChangeApplication(@Param('id') id: string) {
    return this.officeService.getProfileChangeApplicationById(id);
  }

  @Patch('profile-change-applications/:id/status')
  updateProfileChangeApplicationStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProfileChangeApplicationStatusDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.officeService.reviewProfileChangeApplication(
      id,
      dto.status,
      user.id,
    );
  }

  // ── PDF credential generation ─────────────────────────────
  @Post('credentials/pdf')
  async generateCredentialsPdf(
    @Body()
    body: {
      credentials: { username: string; password: string; name: string }[];
    },
  ) {
    const base64Pdf = await this.pdfService.generateCredentialsPdf(
      body.credentials,
    );
    return { pdf: base64Pdf };
  }

  // ── Temp Judges ───────────────────────────────────────────
  @Post('judges')
  async createTempJudge(
    @Body() dto: CreateTempJudgeDto,
    @CurrentUser() user: { id: string },
  ) {
    const { judge, plainPassword } = await this.officeService.createTempJudge(
      dto,
      user.id,
    );
    const pdf = await this.pdfService.generateCredentialsPdf([
      {
        username: judge.judgeId,
        password: plainPassword,
        name: judge.fullName ?? judge.judgeId,
      },
    ]);
    return {
      judge,
      credentials: { username: judge.judgeId, password: plainPassword },
      credentialsPdf: pdf,
    };
  }

  @Get('judges')
  getAllJudges() {
    return this.officeService.getAllJudges();
  }

  @Patch('judges/:id/extend')
  extendJudge(@Param('id') id: string, @Body() dto: ExtendTempJudgeDto) {
    return this.officeService.extendTempJudge(id, dto);
  }

  @Get('judges/:id/credentials')
  async downloadJudgeCredentials(@Param('id') id: string) {
    const { judge, plainPassword } =
      await this.officeService.getTempJudgeCredentials(id);
    const pdf = await this.pdfService.generateCredentialsPdf([
      {
        username: judge.judgeId,
        password: plainPassword,
        name: judge.fullName ?? judge.judgeId,
      },
    ]);
    return {
      judge,
      credentials: { username: judge.judgeId, password: plainPassword },
      credentialsPdf: pdf,
    };
  }

  @Post('judges/:id/credentials/reset')
  async resetJudgeCredentials(@Param('id') id: string) {
    const { judge, plainPassword } =
      await this.officeService.resetTempJudgeCredentials(id);
    const pdf = await this.pdfService.generateCredentialsPdf([
      {
        username: judge.judgeId,
        password: plainPassword,
        name: judge.fullName ?? judge.judgeId,
      },
    ]);
    return {
      judge,
      credentials: { username: judge.judgeId, password: plainPassword },
      credentialsPdf: pdf,
    };
  }

  // ── Semesters ─────────────────────────────────────────────
  @Post('batches')
  createBatch(@Body() dto: CreateBatchDto) {
    return this.officeService.createBatch(dto);
  }

  @Get('batches')
  getBatches() {
    return this.officeService.getAllBatches();
  }

  @Post('semesters')
  createSemester(@Body() dto: CreateSemesterDto) {
    return this.officeService.createSemester(dto);
  }

  @Patch('semesters/:id')
  updateSemester(
    @Param('id') id: string,
    @Body() dto: UpdateSemesterStartDateDto,
  ) {
    return this.officeService.updateSemester(id, dto);
  }

  @Patch('semesters/:id/set-current')
  setCurrentSemester(@Param('id') id: string) {
    return this.officeService.setCurrentSemester(id);
  }

  @Delete('semesters/:id')
  async deleteSemester(@Param('id') id: string) {
    await this.officeService.deleteSemester(id);
    return { success: true };
  }

  @Get('semesters')
  getSemesters() {
    return this.officeService.getAllSemesters();
  }
}
