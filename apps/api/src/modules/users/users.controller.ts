import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { StorageService } from '../storage/storage.service';
import { IsOptional, IsString, IsDateString } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';

class UpdateStudentProfileDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() guardianPhone?: string;
  @IsOptional() @IsString() fathersName?: string;
  @IsOptional() @IsString() mothersName?: string;
  @IsOptional() @IsString() presentAddress?: string;
  @IsOptional() @IsString() permanentAddress?: string;
  @IsOptional() @IsString() gender?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private users: UsersService,
    private storage: StorageService,
  ) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: any) {
    return this.users.getProfileByUserId(user.id, user.role);
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    const student = await this.users.findStudentByUserId(user.id);
    if (student) {
      const updated = await this.users.updateStudent(user.id, {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        guardianPhone: dto.guardianPhone,
        fathersName: dto.fathersName,
        mothersName: dto.mothersName,
        presentAddress: dto.presentAddress,
        permanentAddress: dto.permanentAddress,
        gender: dto.gender,
        profileCompleted: true,
      });
      return updated;
    }
    // For teachers, delegate to teacher fields
    const teacher = await this.users.findTeacherByUserId(user.id);
    if (teacher) {
      return this.users.updateTeacher(user.id, {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        gender: dto.gender,
      });
    }
    return { message: 'No profile to update for this role' };
  }

  @Post('profile/photo')
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage() }))
  async uploadPhoto(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) return { message: 'No file provided' };
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Photo must be an image');
    }
    const saved = await this.storage.saveBuffer(
      file.buffer,
      `${uuidv4()}_${file.originalname}`,
      'profiles',
      5 * 1024 * 1024, // 5MB max
    );
    const student = await this.users.findStudentByUserId(user.id);
    if (student) {
      await this.users.updateStudent(user.id, { profilePhoto: saved.url });
    }
    const teacher = await this.users.findTeacherByUserId(user.id);
    if (teacher) {
      await this.users.updateTeacher(user.id, { profilePhoto: saved.url });
    }
    return { url: saved.url };
  }
}
