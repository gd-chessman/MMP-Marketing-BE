import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { UserAdminService } from './user-admin.service';

@Controller('admin/user-admins')
@UseGuards(JwtAdminGuard)
export class UserAdminController {
  constructor(private userAdminService: UserAdminService) {}

  @Get('me')
  async getProfile(@Request() req) {
    return this.userAdminService.findById(req.user.id);
  }
}
