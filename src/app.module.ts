import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { UserModule } from './modules/user/user.module';
import { RoleModule } from './modules/role/role.module';
import { DefaultDataModule } from './scripts/default/default.module';
import { AuthModule } from './modules/auth/auth.module';
import { appConfig } from './config/app.config';  // Import file config
import { BackupRestoreModule } from './modules/backup-restore/backup-restore.module';
import { SocketModule } from './modules/socket/socket.module';
import { SettingModule } from './modules/setting/setting.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationModule } from './modules/notification/notification.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => databaseConfig(configService),
      inject: [ConfigService],
    }),
    UserModule,
    RoleModule,
    SettingModule,
    DefaultDataModule,
    AuthModule,
    NotificationModule,
    BackupRestoreModule,
    SocketModule,
  ],
  controllers: [AppController], // Các controller của ứng dụng
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    appConfig(consumer);  // Sử dụng cấu hình từ app.config.ts
  }
}
