import { IsOptional, IsEnum, IsInt, Min, Max, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { SwapOrderStatus, TokenType, OutputTokenType } from '../../../swap-orders/swap-order.entity';

export class SearchSwapOrdersDto {
  @IsOptional()
  @IsString()
  search?: string; // Tìm theo wallet address hoặc tx hash

  @IsOptional()
  @IsEnum(SwapOrderStatus)
  status?: SwapOrderStatus;

  @IsOptional()
  @IsEnum(TokenType)
  input_token?: TokenType;

  @IsOptional()
  @IsEnum(OutputTokenType)
  output_token?: OutputTokenType;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
} 