import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserStake } from './user-stake.entity';
import { UserStakeService } from './user-stake.service';
import { UserStakeController } from './user-stake.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserStake])],
  providers: [UserStakeService],
  controllers: [UserStakeController],
  exports: [UserStakeService],
})
export class UserStakeModule {} 