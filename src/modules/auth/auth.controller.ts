import { Controller, Post, Body, Res, UseGuards, Request, Put, UnauthorizedException, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  async login(
    @Body() body: { username: string; password: string },
    @Res() res: Response,
  ) {
    return this.authService.login(body.username, body.password, res);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req, @Res() res: Response) {
    await this.authService.logout(req.user.id);
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return res.status(200).json({ message: 'Đã đăng xuất thành công' });
  }

  @Post('refresh')
  async refresh(@Request() req, @Res() res: Response) {
    const refreshToken = req.cookies['refresh_token'];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    try {
      const accessToken = await this.authService.refreshAccessToken(refreshToken);
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 3600000, // 1 giờ
      });
      return res.status(200).json({ message: 'Token refreshed successfully' });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // Yêu cầu quên mật khẩu
  @Post('forgot-password')
  async forgotPassword(@Body() body: { username: string }, @Res() res: Response) {
    try {
      await this.authService.requestPasswordReset(body.username);
      return res.status(200).json({ message: 'Password reset email sent' });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  // Thay đổi mật khẩu
  @Post('reset-password')
  async resetPassword(
    @Body() body: { token: string; newPassword: string },
    @Res() res: Response,
  ) {
    try {
      await this.authService.resetPassword(body.token, body.newPassword);
      return res.status(200).json({ message: 'Password reset successful' });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  @Put('change-password')
  @UseGuards(JwtAuthGuard) // Chỉ cho phép người dùng đã đăng nhập
  async changePassword(
    @Request() req,
    @Body() body: { oldPassword: string; newPassword: string; confirmPassword: string },
    @Res() res: Response,
  ) {
    try {
      await this.authService.changePassword(req.user.id, body.oldPassword, body.newPassword, body.confirmPassword);
      return res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return res.status(400).json({ message: error });
      }
      return res.status(400).json({ message: error });
    }
  }
}
