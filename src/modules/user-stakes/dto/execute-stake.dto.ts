import { IsNotEmpty, IsString, IsInt } from 'class-validator';

export class ExecuteStakeDto {
  @IsNotEmpty()
  @IsString()
  signedTransaction: string; // Base64 encoded string

  @IsNotEmpty()
  @IsInt()
  staking_plan_id: number;
} 