import { Injectable, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAdmin, UserAdminRole } from '../user-admins/user-admin.entity';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(UserAdmin)
    private userAdminRepository: Repository<UserAdmin>,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.createDefaultAdmin();
  }

  private async createDefaultAdmin() {
    try {
      const adminExists = await this.userAdminRepository.findOne({
        where: { email: 'admin@example.com' },
      });

      if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await this.userAdminRepository.save({
          email: 'admin@example.com',
          password: hashedPassword,
          full_name: 'System Admin',
          role: UserAdminRole.ADMIN,
        });
        console.log('Default admin account created successfully');
      }
    } catch (error) {
      console.error('Error creating default admin account:', error);
    }
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.userAdminRepository.findOne({
      where: { email },
    });

    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * Xử lý đăng nhập và set cookie
   */
  async login(email: string, password: string, response: Response) {
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is locked');
    }

    const payload = { email: user.email, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    // Set HTTP-only cookie
    response.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: parseInt(process.env.COOKIE_EXPIRES_IN) * 1000,
    });


    return {
        success: true,
        message: 'Login successful',
    };
  }

  /**
   * Xử lý đăng xuất và xóa cookie
   */
  async logout(response: Response) {
    response.clearCookie('admin_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });

    return {
        success: true,
        message: 'Logout successful',
    };
  }
}
