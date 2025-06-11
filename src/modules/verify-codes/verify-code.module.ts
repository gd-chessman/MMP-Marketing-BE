import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerifyCode } from './verify-code.entity';
import { VerifyCodeService } from './verify-code.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([VerifyCode])
    ],
    providers: [VerifyCodeService],
    exports: [VerifyCodeService]
})
export class VerifyCodeModule {} 