import { IsNotEmpty, IsString, IsInt } from 'class-validator';

export class ExecuteUnstakeDto {
  @IsNotEmpty()
  @IsString()
  signedTransaction: string; // Base64 encoded string

  @IsNotEmpty()
  @IsInt()
  user_stake_id: number;
} 