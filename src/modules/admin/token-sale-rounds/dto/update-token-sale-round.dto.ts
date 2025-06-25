import { IsOptional, IsString, IsNumber, IsEnum, IsDateString } from 'class-validator';
import { TokenType } from '../../../token-sale-rounds/token-sale-round.entity';

export class UpdateTokenSaleRoundDto {
  @IsOptional()
  @IsString()
  round_name?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsEnum(TokenType)
  coin?: TokenType;

  @IsOptional()
  @IsDateString()
  time_start?: string;

  @IsOptional()
  @IsDateString()
  time_end?: string;
} 