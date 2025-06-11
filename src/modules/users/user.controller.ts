import { Controller, Get, Post, Put, Body, Param, UseGuards, Request, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';

@Controller('users')
@UseInterceptors(ClassSerializerInterceptor)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @UseGuards(JwtGuestGuard)
  async getMe(@Request() req): Promise<User> {
    return this.userService.findById(req.user.user.id);
  }
} 