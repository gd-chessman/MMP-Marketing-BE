import { IsOptional, IsString, IsNumber, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { UserStakeStatus } from '../../../user-stakes/user-stake.entity';

export class SearchStakesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserStakeStatus)
  status?: UserStakeStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  wallet_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  staking_plan_id?: number;

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