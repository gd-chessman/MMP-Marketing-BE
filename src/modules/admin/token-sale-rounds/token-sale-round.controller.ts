import { Controller, Post, Get, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { TokenSaleRoundService } from './token-sale-round.service';
import { CreateTokenSaleRoundDto } from './dto/create-token-sale-round.dto';
import { TokenSaleRound } from '../../token-sale-rounds/token-sale-round.entity';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';

@Controller('admin/token-sale-rounds')
@UseGuards(JwtAdminGuard)
export class TokenSaleRoundController {
  constructor(private readonly tokenSaleRoundService: TokenSaleRoundService) {}

  @Post()
  async create(@Body() createTokenSaleRoundDto: CreateTokenSaleRoundDto): Promise<TokenSaleRound> {
    return this.tokenSaleRoundService.create(createTokenSaleRoundDto);
  }

  @Get()
  async findAll(): Promise<TokenSaleRound[]> {
    return this.tokenSaleRoundService.findAll();
  }
}
