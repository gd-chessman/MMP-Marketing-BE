import { IsString, IsNotEmpty, Length } from 'class-validator';

export class TrackClickDto {
  @IsString()
  @IsNotEmpty()
  @Length(8, 8, { message: 'Referral code must be exactly 8 characters' })
  referral_code: string;
} 