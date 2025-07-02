import { IsOptional, IsString, IsNumber, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum WalletType {
  TELEGRAM = 'telegram', // Có telegram_id
  GOOGLE = 'google',     // Có email
  PHANTOM = 'phantom'    // Không có user
}

export enum WalletTypeFilter {
  ALL = 'all',
  NORMAL = 'normal',
  BJ = 'bj'
}

export enum SwapTokenSort {
  CREATED_AT = 'created_at',
  MMP = 'mmp',
  MPB = 'mpb'
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

export class SearchWalletsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(WalletType)
  type?: WalletType;

  @IsOptional()
  @IsEnum(WalletTypeFilter)
  wallet_type?: WalletTypeFilter = WalletTypeFilter.ALL;

  @IsOptional()
  @IsEnum(SwapTokenSort)
  sort_by?: SwapTokenSort = SwapTokenSort.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sort_order?: SortOrder = SortOrder.DESC;

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