// src/modules/setting/setting.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './setting.entity';

@Injectable()
export class SettingService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>
  ) {}

  // Lấy cấu hình hiện tại (Chỉ có 1 cấu hình trong db)
  async findOne(): Promise<Setting> {
    const setting = await this.settingRepository.findOne({
      where: {}
    });
    if (!setting) {
      throw new NotFoundException('Setting not found');
    }
    return setting;
  }

  // Cập nhật cấu hình (Chỉ có thể có 1 cấu hình trong db)
  async update(settingData: Partial<Setting>): Promise<Setting> {
    const count = await this.settingRepository.count();
    if (count > 1) {
      throw new BadRequestException('There should be only one setting in the database');
    }

    const setting = await this.settingRepository.findOne({
      where: {}
    });
    if (!setting) {
      throw new NotFoundException('Setting not found');
    }

    Object.assign(setting, settingData);
    return this.settingRepository.save(setting);
  }
}
