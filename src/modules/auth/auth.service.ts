import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import * as bcrypt from 'bcryptjs';
import { Response } from 'express'; // Thêm Response từ express để thao tác với cookie
import { EmailService } from '../../common/services/email.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from './refresh-token.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) { }

  // Đăng nhập và tạo JWT token
  async login(username: string, password: string, res: Response): Promise<void> {
    // Tìm người dùng theo username
    const user = await this.userService.findByUsername(username);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Kiểm tra mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new BadRequestException('Invalid password');
    }

    // Tạo access token
    const accessToken = this.jwtService.sign({ 
      username: user.username, 
      sub: user.id 
    });

    // Tạo refresh token
    const refreshToken = await this.createRefreshToken(user);

    // Gửi tokens vào cookie
    res.cookie('access_token', accessToken, {
      httpOnly: true,    // Cookie sẽ không thể truy cập từ JavaScript
      secure: process.env.NODE_ENV === 'production', // Chỉ dùng https khi ở môi trường production
      maxAge: 3600000, // 1 giờ
    });

    res.cookie('refresh_token', refreshToken.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600000, // 7 ngày
    });

    res.status(200).send({ message: 'Login successful' });
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    // Tìm refresh token trong database
    const token = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken },
      relations: ['user'],
    });

    if (!token || token.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Tạo access token mới
    const accessToken = this.jwtService.sign({
      username: token.user.username,
      sub: token.user.id,
    });

    return accessToken;
  }

  async logout(userId: string): Promise<void> {
    // Xóa tất cả refresh token của user
    await this.refreshTokenRepository.delete({ user: { id: userId } });
  }

  private async createRefreshToken(user: any): Promise<RefreshToken> {
    const expiresIn = 7 * 24 * 60 * 60; // 7 ngày
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

    const refreshToken = this.refreshTokenRepository.create({
      token: uuidv4(),
      user,
      expiresAt,
    });

    return this.refreshTokenRepository.save(refreshToken);
  }

  // Yêu cầu quên mật khẩu
  async requestPasswordReset(username: string): Promise<void> {
    const user = await this.userService.findByUsername(username);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Tạo một mã reset token (JWT)
    const payload = { username: user.username, sub: user.id };
    const resetToken = this.jwtService.sign(payload, {
      expiresIn: '10m', // Token sẽ hết hạn trong 10 phút
    });

    // Gửi email với liên kết reset mật khẩu
    await this.emailService.sendPasswordResetEmail(user.email, resetToken);
  }

  // Thay đổi mật khẩu sau khi xác minh mã reset
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const decoded = this.jwtService.verify(token);
      const user = await this.userService.findByUsername(decoded.username);
      if (!user) {
        throw new BadRequestException('User not found');
      }
      const userId = user.id;
      user.password = newPassword;
      await this.userService.update(userId, user);
    } catch (error) {
      throw new BadRequestException('Invalid or expired token');
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
    // Kiểm tra mật khẩu mới và xác nhận mật khẩu
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('New password and confirm password do not match');
    }

    // Lấy thông tin user
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Kiểm tra mật khẩu cũ
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Old password is incorrect');
    }
    user.password = newPassword;

    // Cập nhật mật khẩu trong database
    await this.userService.update(userId, user);
  }
}
