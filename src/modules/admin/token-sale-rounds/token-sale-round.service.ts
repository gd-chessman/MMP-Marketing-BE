import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenSaleRound } from '../../token-sale-rounds/token-sale-round.entity';
import { CreateTokenSaleRoundDto } from './dto/create-token-sale-round.dto';

@Injectable()
export class TokenSaleRoundService {
  constructor(
    @InjectRepository(TokenSaleRound)
    private readonly tokenSaleRoundRepository: Repository<TokenSaleRound>,
  ) {}

  async create(createTokenSaleRoundDto: CreateTokenSaleRoundDto): Promise<TokenSaleRound> {
    // Kiểm tra xem có round nào khác của cùng coin type đang diễn ra trong thời gian này không
    const existingRounds = await this.tokenSaleRoundRepository.find({
      where: { coin: createTokenSaleRoundDto.coin }
    });

    const newStartTime = new Date(createTokenSaleRoundDto.time_start);
    const newEndTime = new Date(createTokenSaleRoundDto.time_end);

    // Kiểm tra xem thời gian bắt đầu mới có nằm trong giai đoạn của round cũ nào không
    for (const existingRound of existingRounds) {
      const existingStartTime = new Date(existingRound.time_start);
      const existingEndTime = new Date(existingRound.time_end);

      // Kiểm tra xem thời gian bắt đầu mới có nằm trong khoảng thời gian của round cũ không
      if (newStartTime >= existingStartTime && newStartTime <= existingEndTime) {
        throw new BadRequestException(
          `New round start time (${newStartTime.toISOString()}) overlaps with existing round "${existingRound.round_name}" (${existingStartTime.toISOString()} - ${existingEndTime.toISOString()})`
        );
      }

      // Kiểm tra xem thời gian kết thúc mới có nằm trong khoảng thời gian của round cũ không
      if (newEndTime >= existingStartTime && newEndTime <= existingEndTime) {
        throw new BadRequestException(
          `New round end time (${newEndTime.toISOString()}) overlaps with existing round "${existingRound.round_name}" (${existingStartTime.toISOString()} - ${existingEndTime.toISOString()})`
        );
      }

      // Kiểm tra xem round mới có bao trùm hoàn toàn round cũ không
      if (newStartTime <= existingStartTime && newEndTime >= existingEndTime) {
        throw new BadRequestException(
          `New round completely overlaps existing round "${existingRound.round_name}" (${existingStartTime.toISOString()} - ${existingEndTime.toISOString()})`
        );
      }
    }

    const tokenSaleRound = this.tokenSaleRoundRepository.create({
      round_name: createTokenSaleRoundDto.round_name,
      quantity: createTokenSaleRoundDto.quantity.toString(),
      coin: createTokenSaleRoundDto.coin,
      time_start: newStartTime,
      time_end: newEndTime,
    });

    return this.tokenSaleRoundRepository.save(tokenSaleRound);
  }

  async findAll(): Promise<TokenSaleRound[]> {
    return this.tokenSaleRoundRepository.find({
      order: {
        created_at: 'DESC'
      }
    });
  }
}
