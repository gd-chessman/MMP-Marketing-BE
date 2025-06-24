import { IsNotEmpty, IsNumber, IsInt, Min } from 'class-validator';

export class PrepareStakeDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount_staked: number;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  lock_months: number;
} 