import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Student } from './entities/student.entity';
import { Teacher } from './entities/teacher.entity';
import { TempJudge } from './entities/temp-judge.entity';
import { TempParticipant } from './entities/temp-participant.entity';
import { UserRole } from '../../common/enums/role.enum';
import {
  ProfileChangeApplication,
  ProfileChangeApplicationStatus,
} from '../office/entities/profile-change-application.entity';

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function formatDateValue(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Student) private studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private teacherRepo: Repository<Teacher>,
    @InjectRepository(TempJudge) private judgeRepo: Repository<TempJudge>,
    @InjectRepository(TempParticipant)
    private participantRepo: Repository<TempParticipant>,
    @InjectRepository(ProfileChangeApplication)
    private profileChangeApplicationRepo: Repository<ProfileChangeApplication>,
  ) {}

  private isStudentProfileComplete(student: Partial<Student>): boolean {
    return Boolean(
      normalizeOptionalText(student.phone) &&
        normalizeOptionalText(student.email) &&
        normalizeOptionalText(student.fathersName) &&
        normalizeOptionalText(student.mothersName) &&
        student.dateOfBirth,
    );
  }

  async findUserByUsername(username: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { username },
      select: [
        'id',
        'username',
        'password',
        'role',
        'isActive',
        'isFirstLogin',
        'expiresAt',
        'passwordChangeSuggested',
      ],
    });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findStudentByUserId(userId: string): Promise<Student | null> {
    return this.studentRepo.findOne({ where: { userId } });
  }

  async findTeacherByUserId(userId: string): Promise<Teacher | null> {
    return this.teacherRepo.findOne({ where: { userId } });
  }

  async findJudgeByUserId(userId: string): Promise<TempJudge | null> {
    return this.judgeRepo.findOne({ where: { userId } });
  }

  async findParticipantByUserId(
    userId: string,
  ): Promise<TempParticipant | null> {
    return this.participantRepo.findOne({ where: { userId } });
  }

  async getProfileByUserId(userId: string, role: UserRole) {
    switch (role) {
      case UserRole.STUDENT:
        return this.studentRepo.findOne({
          where: { userId },
          relations: ['user'],
        });
      case UserRole.TEACHER:
        return this.teacherRepo.findOne({
          where: { userId },
          relations: ['user'],
        });
      case UserRole.TEMP_JUDGE:
        return this.judgeRepo.findOne({
          where: { userId },
          relations: ['user'],
        });
      case UserRole.TEMP_PARTICIPANT:
        return this.participantRepo.findOne({
          where: { userId },
          relations: ['user'],
        });
      default:
        return null;
    }
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    await this.userRepo.update(id, updates);
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateStudent(
    userId: string,
    updates: Partial<Student>,
  ): Promise<Student> {
    const student = await this.studentRepo.findOne({ where: { userId } });
    if (!student) throw new NotFoundException('Student not found');
    Object.assign(student, updates);
    return this.studentRepo.save(student);
  }

  async updateStudentSelfService(
    userId: string,
    updates: Partial<Student>,
  ): Promise<Student> {
    const student = await this.studentRepo.findOne({ where: { userId } });
    if (!student) throw new NotFoundException('Student not found');

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'isFirstLogin'],
    });
    if (!user) throw new NotFoundException('User not found');

    const allowSensitiveFields = Boolean(user.isFirstLogin || !student.profileCompleted);
    const attemptedSensitiveUpdate = [
      updates.fullName,
      updates.email,
      updates.dateOfBirth,
      updates.guardianPhone,
      updates.fathersName,
      updates.gender,
      updates.mothersName,
      updates.permanentAddress,
      updates.profilePhoto,
    ].some((value) => value !== undefined);

    if (!allowSensitiveFields && attemptedSensitiveUpdate) {
      throw new BadRequestException(
        'Submit an office application to change verified profile fields',
      );
    }

    if (updates.phone !== undefined) {
      student.phone = normalizeOptionalText(updates.phone);
    }
    if (updates.presentAddress !== undefined) {
      student.presentAddress = normalizeOptionalText(updates.presentAddress);
    }

    if (allowSensitiveFields) {
      if (updates.email !== undefined) {
        student.email = normalizeOptionalText(updates.email);
      }
      if (updates.dateOfBirth !== undefined) {
        student.dateOfBirth = updates.dateOfBirth ?? null;
      }
      if (updates.fathersName !== undefined) {
        student.fathersName = normalizeOptionalText(updates.fathersName);
      }
      if (updates.mothersName !== undefined) {
        student.mothersName = normalizeOptionalText(updates.mothersName);
      }
      if (updates.fullName !== undefined && !normalizeOptionalText(student.fullName)) {
        student.fullName = normalizeOptionalText(updates.fullName);
      }
    }

    const nextProfileCompleted = this.isStudentProfileComplete(student);
    if (user.isFirstLogin && !nextProfileCompleted) {
      throw new BadRequestException(
        "Phone, email, father's name, mother's name, and date of birth are required to complete your profile",
      );
    }

    student.profileCompleted = nextProfileCompleted;
    return this.studentRepo.save(student);
  }

  async updateTeacher(
    userId: string,
    updates: Partial<Teacher>,
  ): Promise<Teacher> {
    const teacher = await this.teacherRepo.findOne({ where: { userId } });
    if (!teacher) throw new NotFoundException('Teacher not found');
    Object.assign(teacher, updates);
    return this.teacherRepo.save(teacher);
  }

  async updateTeacherSelfService(
    userId: string,
    updates: Partial<Teacher>,
  ): Promise<Teacher> {
    const teacher = await this.teacherRepo.findOne({ where: { userId } });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const attemptedSensitiveUpdate = [
      updates.fullName,
      updates.email,
      updates.gender,
      updates.profilePhoto,
    ].some((value) => value !== undefined);
    if (attemptedSensitiveUpdate) {
      throw new BadRequestException(
        'Submit an office application to change verified profile fields',
      );
    }

    if (updates.phone !== undefined) {
      teacher.phone = normalizeOptionalText(updates.phone);
    }

    return this.teacherRepo.save(teacher);
  }

  async createProfileChangeApplication(
    userId: string,
    role: UserRole,
    requestedUpdates: Record<string, string | undefined>,
    requestedPhoto?: string | null,
  ): Promise<ProfileChangeApplication> {
    if (role === UserRole.STUDENT) {
      const student = await this.studentRepo.findOne({ where: { userId } });
      if (!student) {
        throw new NotFoundException('Student not found');
      }

      const currentData: Record<string, string | null> = {};
      const requestedData: Record<string, string | null> = {};
      const fieldEntries = [
        ['fullName', normalizeOptionalText(student.fullName), normalizeOptionalText(requestedUpdates.fullName)],
        ['email', normalizeOptionalText(student.email), normalizeOptionalText(requestedUpdates.email)],
        ['dateOfBirth', formatDateValue(student.dateOfBirth), formatDateValue(requestedUpdates.dateOfBirth)],
        ['guardianPhone', normalizeOptionalText(student.guardianPhone), normalizeOptionalText(requestedUpdates.guardianPhone)],
        ['fathersName', normalizeOptionalText(student.fathersName), normalizeOptionalText(requestedUpdates.fathersName)],
        ['gender', normalizeOptionalText(student.gender), normalizeOptionalText(requestedUpdates.gender)],
        ['mothersName', normalizeOptionalText(student.mothersName), normalizeOptionalText(requestedUpdates.mothersName)],
        ['permanentAddress', normalizeOptionalText(student.permanentAddress), normalizeOptionalText(requestedUpdates.permanentAddress)],
      ] as const;

      fieldEntries.forEach(([field, currentValue, nextValue]) => {
        if (nextValue && nextValue !== currentValue) {
          currentData[field] = currentValue;
          requestedData[field] = nextValue;
        }
      });

      const normalizedRequestedPhoto = normalizeOptionalText(requestedPhoto);
      const currentPhoto = normalizeOptionalText(student.profilePhoto);
      if (normalizedRequestedPhoto && normalizedRequestedPhoto !== currentPhoto) {
        currentData.profilePhoto = currentPhoto;
        requestedData.profilePhoto = normalizedRequestedPhoto;
      }

      if (!Object.keys(requestedData).length) {
        throw new BadRequestException(
          'Provide at least one changed verified field in the application',
        );
      }

      const application = this.profileChangeApplicationRepo.create({
        requesterUserId: userId,
        requesterRole: role,
        requesterName: student.fullName || student.studentId,
        requesterIdentifier: student.studentId,
        requesterPhoto: student.profilePhoto ?? null,
        currentData,
        requestedData,
        requestedPhoto: normalizedRequestedPhoto,
        status: ProfileChangeApplicationStatus.PENDING,
      });
      return this.profileChangeApplicationRepo.save(application);
    }

    if (role === UserRole.TEACHER) {
      const teacher = await this.teacherRepo.findOne({ where: { userId } });
      if (!teacher) {
        throw new NotFoundException('Teacher not found');
      }

      const currentData: Record<string, string | null> = {};
      const requestedData: Record<string, string | null> = {};
      const fieldEntries = [
        ['fullName', normalizeOptionalText(teacher.fullName), normalizeOptionalText(requestedUpdates.fullName)],
        ['email', normalizeOptionalText(teacher.email), normalizeOptionalText(requestedUpdates.email)],
        ['gender', normalizeOptionalText(teacher.gender), normalizeOptionalText(requestedUpdates.gender)],
      ] as const;

      fieldEntries.forEach(([field, currentValue, nextValue]) => {
        if (nextValue && nextValue !== currentValue) {
          currentData[field] = currentValue;
          requestedData[field] = nextValue;
        }
      });

      const normalizedRequestedPhoto = normalizeOptionalText(requestedPhoto);
      const currentPhoto = normalizeOptionalText(teacher.profilePhoto);
      if (normalizedRequestedPhoto && normalizedRequestedPhoto !== currentPhoto) {
        currentData.profilePhoto = currentPhoto;
        requestedData.profilePhoto = normalizedRequestedPhoto;
      }

      if (!Object.keys(requestedData).length) {
        throw new BadRequestException(
          'Provide at least one changed verified field in the application',
        );
      }

      const application = this.profileChangeApplicationRepo.create({
        requesterUserId: userId,
        requesterRole: role,
        requesterName: teacher.fullName || teacher.teacherId,
        requesterIdentifier: teacher.teacherId,
        requesterPhoto: teacher.profilePhoto ?? null,
        currentData,
        requestedData,
        requestedPhoto: normalizedRequestedPhoto,
        status: ProfileChangeApplicationStatus.PENDING,
      });
      return this.profileChangeApplicationRepo.save(application);
    }

    throw new BadRequestException(
      'Only students and teachers can submit profile change applications',
    );
  }

  async getProfileChangeApplicationsForUser(
    userId: string,
  ): Promise<ProfileChangeApplication[]> {
    return this.profileChangeApplicationRepo.find({
      where: { requesterUserId: userId },
      order: { createdAt: 'DESC' },
    });
  }
}
