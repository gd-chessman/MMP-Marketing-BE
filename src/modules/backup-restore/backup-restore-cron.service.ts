import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';  // Import Cron decorator
import { BackupRetoreService } from './backup-restore.service';

@Injectable()
export class BackupRestoreCronService {
  constructor(private readonly backupService: BackupRetoreService) {}

  @Cron('0 2 * * *')  // Cron expression: "0 2 * * *" có nghĩa là chạy vào lúc 02:00 mỗi ngày
  async handleDailyBackup() {
    console.log('Starting backup at the beginning of the day...');
    try {
      const result = await this.backupService.backupAndSendEmail();
      console.log('Backup completed successfully:', result);
    } catch (error) {
      console.error('Error during daily backup:', error);
    }
  }
}
