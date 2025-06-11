import { Controller } from '@nestjs/common';
import { UserStakeService } from './user-stake.service';

@Controller('user-stakes')
export class UserStakeController {
  constructor(private readonly userStakeService: UserStakeService) {}

  // Các route sẽ được thêm sau
} 