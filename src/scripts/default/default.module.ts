import { Module } from '@nestjs/common';
import { DefaultDataService } from './default-data.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../modules/user/user.entity';
import { Setting } from '../../modules/setting/setting.entity';
import { RoleModule } from 'src/modules/role/role.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Setting]),
    RoleModule,
  ],
  providers: [DefaultDataService],
  exports: [DefaultDataService],
})
export class DefaultDataModule {}
