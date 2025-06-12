import { IsNotEmpty, IsNumber, Min, IsString } from 'class-validator';

export class CreateUserStakeDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsNumber()
  staking_plan_id: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount_staked: number;
} 