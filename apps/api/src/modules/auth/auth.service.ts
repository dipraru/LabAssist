import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { UserRole } from '../../common/enums/role.enum';
import * as bcrypt from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findUserByUsername(username);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');

    // Check expiry for temp accounts
    if (user.expiresAt && new Date() > user.expiresAt) {
      throw new UnauthorizedException('Account access has expired');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return user;
  }

  async login(user: User) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    const token = this.jwtService.sign(payload);

    // Load profile depending on role
    const profile = await this.usersService.getProfileByUserId(user.id, user.role);

    return {
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isFirstLogin: user.isFirstLogin,
        passwordChangeSuggested: user.passwordChangeSuggested,
        profile,
      },
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    user.password = await bcrypt.hash(newPassword, 12);
    user.passwordChangeSuggested = false;
    await this.userRepo.save(user);
    return { message: 'Password changed successfully' };
  }

  async markFirstLoginDone(userId: string) {
    await this.userRepo.update(userId, { isFirstLogin: false });
  }
}
