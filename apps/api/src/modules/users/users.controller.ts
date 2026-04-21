import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import { IsDateString, IsEmail, IsOptional, IsString } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '../../common/enums/role.enum';

class UpdateStudentProfileDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() fathersName?: string;
  @IsOptional() @IsString() mothersName?: string;
  @IsOptional() @IsString() guardianPhone?: string;
  @IsOptional() @IsString() permanentAddress?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() presentAddress?: string;
}

class CreateProfileChangeApplicationDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() fathersName?: string;
  @IsOptional() @IsString() mothersName?: string;
  @IsOptional() @IsString() guardianPhone?: string;
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
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage() }))
  async updateProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateStudentProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const student = await this.users.findStudentByUserId(user.id);
    if (student) {
      let savedPhoto:
        | {
            url: string;
            filePath: string;
          }
        | undefined;

      if (file) {
        if (!file.mimetype?.startsWith('image/')) {
          throw new BadRequestException('Profile photo must be an image');
        }

        savedPhoto = await this.storage.saveBuffer(
          file.buffer,
          `${uuidv4()}_${file.originalname}`,
          'profiles',
          5 * 1024 * 1024,
        );
      }

      try {
        const updated = await this.users.updateStudentSelfService(user.id, {
          fullName: dto.fullName,
          phone: dto.phone,
          email: dto.email,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          fathersName: dto.fathersName,
          mothersName: dto.mothersName,
          guardianPhone: dto.guardianPhone,
          permanentAddress: dto.permanentAddress,
          gender: dto.gender,
          presentAddress: dto.presentAddress,
          profilePhoto: savedPhoto?.url,
        });
        return updated;
      } catch (error) {
        if (savedPhoto) {
          this.storage.deleteFile(savedPhoto.filePath);
        }
        throw error;
      }
    }
    // For teachers, delegate to teacher fields
    const teacher = await this.users.findTeacherByUserId(user.id);
    if (teacher) {
      if (file) {
        throw new ForbiddenException(
          'Submit an office application to change your profile photo',
        );
      }
      return this.users.updateTeacherSelfService(user.id, {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
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
    const student = await this.users.findStudentByUserId(user.id);
    const teacher = await this.users.findTeacherByUserId(user.id);

    if (student || teacher) {
      throw new ForbiddenException(
        'Submit an office application to change your profile photo',
      );
    }

    if (!file) return { message: 'No file provided' };
    return { message: 'Photo uploads are not enabled for this account' };
  }

  @Get('profile-change-applications')
  async getMyProfileChangeApplications(@CurrentUser() user: any) {
    return this.users.getProfileChangeApplicationsForUser(user.id);
  }

  @Post('profile-change-applications')
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage() }))
  async createProfileChangeApplication(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateProfileChangeApplicationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let savedPhoto:
      | {
          url: string;
          filePath: string;
        }
      | undefined;

    if (file) {
      if (!file.mimetype?.startsWith('image/')) {
        throw new BadRequestException('Requested photo must be an image');
      }

      savedPhoto = await this.storage.saveBuffer(
        file.buffer,
        `${uuidv4()}_${file.originalname}`,
        'profiles',
        5 * 1024 * 1024,
      );
    }

    try {
      return await this.users.createProfileChangeApplication(
        user.id,
        user.role,
        {
          fullName: dto.fullName,
          email: dto.email,
          dateOfBirth: dto.dateOfBirth,
          fathersName: dto.fathersName,
          mothersName: dto.mothersName,
          guardianPhone: dto.guardianPhone,
          permanentAddress: dto.permanentAddress,
          gender: dto.gender,
        },
        savedPhoto?.url,
      );
    } catch (error) {
      if (savedPhoto) {
        this.storage.deleteFile(savedPhoto.filePath);
      }
      throw error;
    }
  }
}
