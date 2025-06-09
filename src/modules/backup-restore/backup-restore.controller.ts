import { Controller, Get, HttpException, HttpStatus, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { BackupRetoreService } from './backup-restore.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/backup-restore')
export class BackupRestoreController {
  constructor(private readonly backupService: BackupRetoreService) {}

  // Endpoint để thực hiện backup và gửi email
  @Post("/backup")
  @UseGuards(JwtAuthGuard)
  async sendBackupToEmail() {
    try {
      const result = await this.backupService.backupAndSendEmail();
      return result;
    } catch (error) {
      // Nếu có lỗi trong quá trình sao lưu hoặc gửi email, trả về mã lỗi 500 (Internal Server Error)
      throw new HttpException(
        { message: 'Failed to send backup', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('/restore')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { storage: undefined })) // Sử dụng buffer
  async restoreFromBackup(@UploadedFile() file: Express.Multer.File) {
    try {
      if (!file) {
        throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
      }

      const result = await this.backupService.restoreFromBackup(file.buffer);
      return result;
    } catch (error) {
      throw new HttpException(
        { message: 'Failed to restore backup', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
