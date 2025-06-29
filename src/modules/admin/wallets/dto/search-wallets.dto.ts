import { IsOptional, IsString, IsNumber, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum WalletType {
  TELEGRAM = 'telegram', // Có telegram_id
  GOOGLE = 'google',     // Có email
  PHANTOM = 'phantom'    // Không có user
}

export class SearchWalletsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(WalletType)
  type?: WalletType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;
} 