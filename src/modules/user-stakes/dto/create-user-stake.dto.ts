import { IsNotEmpty, IsNumber, IsInt, Min } from 'class-validator';

export class CreateUserStakeDto {
  @IsNotEmpty()
  @IsInt()
  staking_plan_id: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount_staked: number;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  lock_months: number;
} 