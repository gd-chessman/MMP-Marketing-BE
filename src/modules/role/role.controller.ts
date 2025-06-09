import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { RoleService } from './role.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Role } from './role.entity';
import { UserService } from '../user/user.service';

@Controller('api/roles')
export class RoleController {
    constructor(
        private readonly roleService: RoleService,
        private readonly userService: UserService,
    ) { }

    @Get()
    @UseGuards(JwtAuthGuard)
    async findAll(@Request() req): Promise<Role[]> {
        const userId = req.user._id;
        const user = await this.userService.findById(userId); // Dùng await để lấy dữ liệu
        const numberLevelRole = user.role.level;
        return this.roleService.findAll(numberLevelRole);
    }
    
}
