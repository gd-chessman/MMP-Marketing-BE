import { Controller, Post, Get, Body, UseGuards, Request, Param } from '@nestjs/common';
import { UserStakeService } from './user-stake.service';
import { CreateUserStakeDto } from './dto/create-user-stake.dto';
import { UserStake } from './user-stake.entity';
import { JwtGuestGuard } from '../../modules/auth/jwt-guest.guard';
import { PrepareStakeDto } from './dto/prepare-stake.dto';
import { ExecuteStakeDto } from './dto/execute-stake.dto';
import { ExecuteUnstakeDto } from './dto/execute-unstake.dto';

@Controller('user-stakes')
export class UserStakeController {
  constructor(private readonly userStakeService: UserStakeService) {}

  /**
   * [S2S] Stake bằng private key lưu trên server.
   */
  @Post('stake-by-wallet')
  @UseGuards(JwtGuestGuard)
  async create(@Request() req, @Body() createUserStakeDto: CreateUserStakeDto): Promise<UserStake> {
    return await this.userStakeService.create(req.user.wallet.id, createUserStakeDto);
  }

  /**
   * [S2S] Unstake bằng private key lưu trên server.
   */
  @Post('unstake-by-wallet/:id')
  @UseGuards(JwtGuestGuard)
  async unstake(@Request() req, @Param('id') id: number): Promise<UserStake> {
    return await this.userStakeService.unstake(req.user.wallet.id, id);
  }

  // --- Luồng ký bằng ví (Client-side) ---

  /**
   * [Client] Bước 1: Chuẩn bị giao dịch STAKE cho client ký.
   * @returns Giao dịch chưa ký, dạng base64.
   */
  @Post('prepare-stake-transaction')
  @UseGuards(JwtGuestGuard)
  async prepareStakeTransaction(@Request() req, @Body() prepareStakeDto: PrepareStakeDto) {
    return this.userStakeService.prepareStakeTransaction(req.user.wallet, prepareStakeDto);
  }

  /**
   * [Client] Bước 2: Thực thi giao dịch STAKE đã được client ký.
   */
  @Post('execute-stake-transaction')
  @UseGuards(JwtGuestGuard)
  async executeStakeTransaction(@Request() req, @Body() executeStakeDto: ExecuteStakeDto) {
    return this.userStakeService.executeStakeTransaction(req.user.wallet, executeStakeDto);
  }

  /**
   * [Client] Bước 1: Chuẩn bị giao dịch UNSTAKE cho client ký.
   * @returns Giao dịch chưa ký, dạng base64.
   */
  @Post('prepare-unstake-transaction/:id')
  @UseGuards(JwtGuestGuard)
  async prepareUnstakeTransaction(@Request() req, @Param('id') userStakeId: number) {
    return this.userStakeService.prepareUnstakeTransaction(req.user.wallet, userStakeId);
  }

  /**
   * [Client] Bước 2: Thực thi giao dịch UNSTAKE đã được client ký.
   */
  @Post('execute-unstake-transaction')
  @UseGuards(JwtGuestGuard)
  async executeUnstakeTransaction(@Request() req, @Body() executeUnstakeDto: ExecuteUnstakeDto) {
    return this.userStakeService.executeUnstakeTransaction(req.user.wallet, executeUnstakeDto);
  }

  /**
   * Lấy danh sách các gói stake của user.
   */
  @Get()
  @UseGuards(JwtGuestGuard)
  async getMyStakes(@Request() req): Promise<UserStake[]> {
    return await this.userStakeService.findByWalletId(req.user.wallet.id);
  }
} 