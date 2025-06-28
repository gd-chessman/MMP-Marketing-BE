import { Controller, Post, Body } from '@nestjs/common';
import { ReferralClickService } from './referral-click.service';
import { TrackClickDto } from './dto/track-click.dto';

@Controller('referral-clicks')
export class ReferralClickController {
  constructor(private readonly referralClickService: ReferralClickService) {}

  @Post()
  async trackClick(@Body() trackClickDto: TrackClickDto): Promise<{ success: boolean; message: string }> {
    return this.referralClickService.trackClick(trackClickDto);
  }
} 