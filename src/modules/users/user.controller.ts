import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @UseGuards(JwtGuestGuard)
  async findAll(): Promise<User[]> {
    return this.userService.findAll();
  }
} 