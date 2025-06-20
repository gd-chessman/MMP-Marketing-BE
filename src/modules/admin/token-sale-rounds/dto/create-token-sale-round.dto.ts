import { IsString, IsNumber, IsDateString, IsNotEmpty, Min, MaxLength, IsEnum } from 'class-validator';

export enum CoinType {
  MMP = 'MMP',
  MPB = 'MPB'
}

export class CreateTokenSaleRoundDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  round_name: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsEnum(CoinType)
  @IsNotEmpty()
  coin: CoinType;

  @IsDateString()
  time_start: string;

  @IsDateString()
  time_end: string;
} 