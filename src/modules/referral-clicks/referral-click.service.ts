import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferralClick } from './referral-click.entity';
import { Wallet } from '../wallets/wallet.entity';
import { TrackClickDto } from './dto/track-click.dto';


@Injectable()
export class ReferralClickService {
  constructor(
    @InjectRepository(ReferralClick)
    private referralClickRepository: Repository<ReferralClick>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  async trackClick(trackClickDto: TrackClickDto): Promise<{ success: boolean; message: string }> {
    const { referral_code } = trackClickDto;

    // Tìm wallet theo referral code
    const wallet = await this.walletRepository.findOne({
      where: { referral_code }
    });

    if (!wallet) {
      throw new NotFoundException('Invalid referral code');
    }

    // Tìm hoặc tạo click stats cho wallet
    let clickStats = await this.referralClickRepository.findOne({
      where: { wallet_id: wallet.id }
    });

    if (!clickStats) {
      // Tạo mới nếu chưa có
      clickStats = this.referralClickRepository.create({
        wallet_id: wallet.id,
        total_clicks: 0,
        clicks_today: 0,
        clicks_this_week: 0,
        clicks_this_month: 0
      });
    }

    // Tăng các counter
    clickStats.total_clicks += 1;
    clickStats.clicks_today += 1;
    clickStats.clicks_this_week += 1;
    clickStats.clicks_this_month += 1;
    clickStats.last_click_at = new Date();

    await this.referralClickRepository.save(clickStats);

    return {
      success: true,
      message: 'Click tracked successfully'
    };
  }
} 