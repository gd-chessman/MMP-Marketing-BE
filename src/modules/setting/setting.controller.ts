// src/modules/setting/setting.controller.ts
import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { SettingService } from './setting.service';
import { Setting } from './setting.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/setting')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  // API để lấy cấu hình hiện tại (Duy nhất 1 cấu hình)
  @Get()
  @UseGuards(JwtAuthGuard)
  async findOne(): Promise<Setting> {
    return this.settingService.findOne();
  }

  // API để cập nhật cấu hình (Chỉ có thể có 1 cấu hình trong DB)
  @Put()
  @UseGuards(JwtAuthGuard)
  async update(@Body() settingData: Partial<Setting>): Promise<Setting> {
    return this.settingService.update(settingData);
  }
}
