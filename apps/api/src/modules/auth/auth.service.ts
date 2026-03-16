import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { UserRole } from '../../common/enums/role.enum';
import * as bcrypt from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ConfigService } from '@nestjs/config';

type BridgeUser = {
  id: string;
  username: string;
  role: UserRole;
  isFirstLogin: boolean;
  passwordChangeSuggested: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(User) private userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  private async validateLocalUser(username: string, password: string): Promise<User> {
    const user = await this.usersService.findUserByUsername(username);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');

    if (user.expiresAt && new Date() > user.expiresAt) {
      throw new UnauthorizedException('Account access has expired');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return user;
  }

  async validateUser(username: string, password: string): Promise<User | BridgeUser> {
    const user = await this.usersService.findUserByUsername(username);
    if (!user) {
      const configuredBridgeUrl = this.config.get<string>('KUETOJ_AUTH_BRIDGE_URL');
      const bridgeUrls = [
        configuredBridgeUrl,
        'http://localhost:3100/api/auth/validate-user',
        'http://localhost:3100/api/auth/validate-local-user',
      ].filter((url): url is string => Boolean(url));

      for (const bridgeUrl of bridgeUrls) {
        try {
          const response = await fetch(bridgeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });
          if (!response.ok) continue;

          const bridgeUser = await response.json() as BridgeUser;
          if (
            !bridgeUser?.id
            || !bridgeUser?.username
            || ![UserRole.TEMP_JUDGE, UserRole.TEMP_PARTICIPANT].includes(bridgeUser.role)
          ) {
            continue;
          }

          return bridgeUser;
        } catch {
          continue;
        }
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    return this.validateLocalUser(username, password);
  }

  async validateTempUserForBridge(username: string, password: string) {
    const user = await this.validateLocalUser(username, password);
    if (![UserRole.TEMP_JUDGE, UserRole.TEMP_PARTICIPANT].includes(user.role)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      isFirstLogin: user.isFirstLogin,
      passwordChangeSuggested: user.passwordChangeSuggested,
    };
  }

  async login(user: User | BridgeUser) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    const token = this.jwtService.sign(payload);

    const shouldLoadProfile = ![UserRole.TEMP_JUDGE, UserRole.TEMP_PARTICIPANT].includes(user.role);
    const profile = shouldLoadProfile
      ? await this.usersService.getProfileByUserId(user.id, user.role)
      : null;

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
