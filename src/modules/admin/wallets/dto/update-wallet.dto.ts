import { IsEnum, IsNotEmpty } from 'class-validator';
import { WalletType } from '../../../wallets/wallet.entity';

export class UpdateWalletDto {
  @IsNotEmpty()
  @IsEnum(WalletType)
  wallet_type: WalletType;
} 