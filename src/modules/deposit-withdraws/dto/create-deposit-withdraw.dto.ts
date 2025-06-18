import { IsNotEmpty, IsString, IsNumber } from 'class-validator';

export class CreateDepositWithdrawDto {
  @IsNotEmpty()
  @IsString()
  to_address: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  type: 'deposit' | 'withdraw';

  @IsNotEmpty()
  @IsString()
  symbol: string;
} 