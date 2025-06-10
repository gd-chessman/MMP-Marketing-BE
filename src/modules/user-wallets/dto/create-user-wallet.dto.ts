import { IsBoolean, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateUserWalletDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  gg_auth?: string;

  @IsBoolean()
  @IsOptional()
  isActiveMail?: boolean;

  @IsString()
  @IsOptional()
  telegram_id?: string;

  @IsString()
  @IsNotEmpty()
  sol_address: string;

  @IsString()
  @IsNotEmpty()
  private_key: string;

  @IsNumber()
  @IsOptional()
  balance_sol?: number;

  @IsNumber()
  @IsOptional()
  balance_mmp?: number;
} 