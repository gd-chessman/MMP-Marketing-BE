import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { UserStakeService } from './user-stake.service';
import { CreateUserStakeDto } from './dto/create-user-stake.dto';
import { UserStake } from './user-stake.entity';
import { JwtGuestGuard } from '../../modules/auth/jwt-guest.guard';

@Controller('user-stakes')
export class UserStakeController {
  constructor(private readonly userStakeService: UserStakeService) {}

  @Post()
  @UseGuards(JwtGuestGuard)
  async create(@Request() req, @Body() createUserStakeDto: CreateUserStakeDto): Promise<UserStake> {
    return await this.userStakeService.create(req.user.wallet.id, createUserStakeDto);
  }

  @Get()
  @UseGuards(JwtGuestGuard)
  async getMyStakes(@Request() req): Promise<UserStake[]> {
    return await this.userStakeService.findByWalletId(req.user.wallet.id);
  }
} 