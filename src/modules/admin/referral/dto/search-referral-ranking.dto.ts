import { IsOptional, IsEnum, IsInt, Min, Max, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export enum RankingPeriod {
  ALL_TIME = 'all_time',
  THIS_MONTH = 'this_month',
  THIS_WEEK = 'this_week'
}

export class SearchReferralRankingDto {
  @IsOptional()
  @IsEnum(RankingPeriod)
  period?: RankingPeriod = RankingPeriod.ALL_TIME;

  @IsOptional()
  @IsString()
  search?: string;

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
  limit?: number = 10;
} 