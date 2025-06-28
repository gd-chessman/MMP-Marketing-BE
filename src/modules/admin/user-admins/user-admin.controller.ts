import { Controller, Get, Post, Delete, UseGuards, Request, UseInterceptors, ClassSerializerInterceptor, Body, Query, Param } from '@nestjs/common';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { UserAdminService } from './user-admin.service';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { SearchUserAdminsDto } from './dto/search-user-admins.dto';
import { DeleteUserAdminDto } from './dto/delete-user-admin.dto';
import { UserAdminStatisticsDto } from './dto/user-admin-statistics.dto';

@Controller('admin/user-admins')
@UseGuards(JwtAdminGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class UserAdminController {
  constructor(private userAdminService: UserAdminService) {}

  @Get('me')
  async getProfile(@Request() req) {
    return this.userAdminService.findById(req.user.id);
  }

  @Get()
  async findAll(@Query() searchDto: SearchUserAdminsDto) {
    return this.userAdminService.findAll(searchDto);
  }

  @Get('statistics')
  async getStatistics(): Promise<UserAdminStatisticsDto> {
    return this.userAdminService.getStatistics();
  }

  @Post()
  async create(@Body() createUserAdminDto: CreateUserAdminDto, @Request() req) {
    return this.userAdminService.create(createUserAdminDto, req.user);
  }

  @Delete(':id')
  async delete(@Param() deleteUserAdminDto: DeleteUserAdminDto, @Request() req) {
    return this.userAdminService.delete(deleteUserAdminDto, req.user);
  }
}
