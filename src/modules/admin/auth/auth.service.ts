import { Injectable, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAdmin, UserAdminRole } from '../entites/user-admin.entity';
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
        console.log('Đã tạo tài khoản admin mặc định thành công');
      }
    } catch (error) {
      console.error('Lỗi khi tạo tài khoản admin mặc định:', error);
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
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    const payload = { email: user.email, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    // Set HTTP-only cookie
    response.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      path: '/',
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
      sameSite: 'strict',
      path: '/',
    });

    return {
        success: true,
        message: 'Logout successful',
    };
  }
}
