import { IsEnum, IsNumber, Min, IsString, IsNotEmpty } from 'class-validator';
import { TokenType } from '../swap-order.entity';

export class CreateSwapOrderDto {
  @IsEnum(TokenType)
  input_token: TokenType;

  @IsNumber()
  @Min(0)
  input_amount: number;
}

export class InitWeb3WalletDto {
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  @IsEnum(TokenType)
  inputToken: TokenType;

  @IsNumber()
  @Min(0)
  inputAmount: number;
}

export class CompleteWeb3WalletDto {
  @IsNumber()
  orderId: number;

  @IsString()
  @IsNotEmpty()
  signature: string;
} 