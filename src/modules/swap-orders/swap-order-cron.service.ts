import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SwapOrder, SwapOrderStatus } from './swap-order.entity';
import { LessThan } from 'typeorm';

@Injectable()
export class SwapOrderCronService {
  private readonly logger = new Logger(SwapOrderCronService.name);
  private readonly ORDER_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds

  constructor(
    @InjectRepository(SwapOrder)
    private swapOrderRepository: Repository<SwapOrder>,
  ) {}

  @Cron('0 0 * * * *')
  async handleExpiredOrders() {
    try {
      const now = new Date();
      const timeoutThreshold = new Date(now.getTime() - this.ORDER_TIMEOUT);

      // Find all PENDING orders that are older than 3 minutes
      const expiredOrders = await this.swapOrderRepository.find({
        where: {
          status: SwapOrderStatus.PENDING,
          created_at: LessThan(timeoutThreshold),
        },
      });

      if (expiredOrders.length > 0) {
        this.logger.log(`Found ${expiredOrders.length} expired orders`);

        // Update status to FAILED for all expired orders
        for (const order of expiredOrders) {
          order.status = SwapOrderStatus.FAILED;
          await this.swapOrderRepository.save(order);
          this.logger.log(`Order ${order.id} marked as FAILED due to timeout`);
        }
      }
    } catch (error) {
      this.logger.error(`Error handling expired orders: ${error.message}`);
    }
  }
} 