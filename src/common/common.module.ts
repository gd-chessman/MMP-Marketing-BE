import { Module, Global } from '@nestjs/common';
import { EmailService } from './services/email.service';

@Global() // Global Module
@Module({
  providers: [EmailService],
  exports: [EmailService], // Xuất các service
})
export class CommonModule {}
