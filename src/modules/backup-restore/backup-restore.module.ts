import { Module } from '@nestjs/common';
import { BackupRetoreService } from './backup-restore.service';
import { BackupRestoreController } from './backup-restore.controller';
import { EmailService } from '../../common/services/email.service';
import { BackupRestoreCronService } from './backup-restore-cron.service';

@Module({
  controllers: [BackupRestoreController],
  providers: [BackupRetoreService, BackupRestoreCronService, EmailService],
})
export class BackupRestoreModule {}
