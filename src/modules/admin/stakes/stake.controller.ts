import { Controller, Get, Query, Param, ParseIntPipe, UseGuards, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { StakeService } from './stake.service';
import { SearchStakesDto } from './dto/search-stakes.dto';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { StakeListResponseDto } from './dto/stake-response.dto';

@Controller('admin/stakes')
@UseGuards(JwtAdminGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class StakeController {
  constructor(private readonly stakeService: StakeService) {}

  @Get()
  async findAll(@Query() searchStakesDto: SearchStakesDto): Promise<StakeListResponseDto> {
    return this.stakeService.findAll(searchStakesDto);
  }

  @Get('statistics')
  async getStatistics() {
    return this.stakeService.getStatistics();
  }
}
