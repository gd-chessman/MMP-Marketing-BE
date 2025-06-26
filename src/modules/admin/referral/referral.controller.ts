import { Controller, Get, Query, UseGuards, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { ReferralService } from './referral.service';
import { SearchReferralRankingDto } from './dto/search-referral-ranking.dto';

@Controller('admin/referral')
@UseGuards(JwtAdminGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class ReferralController {
  constructor(private referralService: ReferralService) {}

  @Get('ranking')
  async getReferralRanking(@Query() searchDto: SearchReferralRankingDto) {
    return this.referralService.getReferralRanking(searchDto);
  }
}
