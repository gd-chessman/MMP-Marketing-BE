import { Controller, Get, UseGuards, Request, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { UserAdminService } from './user-admin.service';

@Controller('admin/user-admins')
@UseGuards(JwtAdminGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class UserAdminController {
  constructor(private userAdminService: UserAdminService) {}

  @Get('me')
  async getProfile(@Request() req) {
    return this.userAdminService.findById(req.user.id);
  }
}
