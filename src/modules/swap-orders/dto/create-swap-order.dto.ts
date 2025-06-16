import { IsEnum, IsNumber, Min, IsString, IsNotEmpty } from 'class-validator';
import { OutputTokenType, TokenType } from '../swap-order.entity';

export class CreateSwapOrderDto {
  @IsEnum(TokenType)
  input_token: TokenType;

  @IsEnum(OutputTokenType)
  output_token: OutputTokenType;

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

  @IsEnum(OutputTokenType)
  outputToken: OutputTokenType;

  @IsNumber()
  @Min(0)
  inputAmount: number;
}

export class CompleteWeb3WalletDto {
  @IsNumber()
  @IsNotEmpty()
  orderId: number;

  @IsString()
  @IsNotEmpty()
  signature: string;

} 