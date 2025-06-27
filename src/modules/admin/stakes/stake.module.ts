import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StakeController } from './stake.controller';
import { StakeService } from './stake.service';
import { UserStake } from '../../user-stakes/user-stake.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserStake])],
  controllers: [StakeController],
  providers: [StakeService],
  exports: [StakeService],
})
export class StakeModule {}
