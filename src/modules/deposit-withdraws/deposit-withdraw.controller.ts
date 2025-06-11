import { Controller } from '@nestjs/common';
import { DepositWithdrawService } from './deposit-withdraw.service';

@Controller('deposit-withdraws')
export class DepositWithdrawController {
  constructor(private readonly depositWithdrawService: DepositWithdrawService) {}

  // Các route sẽ được thêm sau
} 