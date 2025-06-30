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

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Chủ nhật là ngày đầu tuần
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    if (!clickStats) {
      // Tạo mới nếu chưa có
      clickStats = this.referralClickRepository.create({
        wallet_id: wallet.id,
        total_clicks: 1,
        clicks_today: 1,
        clicks_this_week: 1,
        clicks_this_month: 1,
        last_click_at: now
      });
    } else {
      // Kiểm tra và reset counter theo thời gian
      const lastClickDate = clickStats.last_click_at ? new Date(clickStats.last_click_at) : null;
      
      // Reset clicks_today nếu đã qua ngày mới
      if (!lastClickDate || lastClickDate < today) {
        clickStats.clicks_today = 1;
      } else {
        clickStats.clicks_today += 1;
      }

      // Reset clicks_this_week nếu đã qua tuần mới
      if (!lastClickDate || lastClickDate < startOfWeek) {
        clickStats.clicks_this_week = 1;
      } else {
        clickStats.clicks_this_week += 1;
      }

      // Reset clicks_this_month nếu đã qua tháng mới
      if (!lastClickDate || lastClickDate < startOfMonth) {
        clickStats.clicks_this_month = 1;
      } else {
        clickStats.clicks_this_month += 1;
      }

      // Tăng total_clicks
      clickStats.total_clicks += 1;
      clickStats.last_click_at = now;
    }

    await this.referralClickRepository.save(clickStats);

    return {
      success: true,
      message: 'Click tracked successfully'
    };
  }
} 