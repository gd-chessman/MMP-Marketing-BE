import { IsString, IsNumber, IsDateString, IsNotEmpty, Min, MaxLength, IsEnum } from 'class-validator';
import { TokenType } from '../../../token-sale-rounds/token-sale-round.entity';

export class CreateTokenSaleRoundDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  round_name: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsEnum(TokenType)
  @IsNotEmpty()
  coin: TokenType;

  @IsDateString()
  time_start: string;

  @IsDateString()
  time_end: string;
} 