import { IsEnum, IsNumber, Min } from 'class-validator';
import { TokenType } from '../swap-order.entity';

export class CreateSwapOrderDto {
  @IsEnum(TokenType)
  input_token: TokenType;

  @IsNumber()
  @Min(0)
  input_amount: number;
} 