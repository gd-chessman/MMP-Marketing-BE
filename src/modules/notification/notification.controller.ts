import { Controller, Get, Post, Param, Body, Patch, Request, UseGuards, Query } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Notification } from './notification.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // API để lấy tất cả thông báo của người dùng
  @Get()
  @UseGuards(JwtAuthGuard) // Bảo vệ route bằng JwtAuthGuard
  async getNotifications(
    @Request() req, 
    @Query('page') page: number = 1, 
    @Query('limit') limit: number = 100
  ): Promise<{ data: Notification[]; total: number; currentPage: number; totalPages: number }> {
    const userId = req.user._id; // Lấy ID người dùng từ token JWT
    return this.notificationService.getNotifications(userId, page, limit); // Lấy thông báo với phân trang
  }
  


  // API để đánh dấu thông báo là đã đọc
  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  async markAsRead(@Param('id') id: string): Promise<Notification> {
    return this.notificationService.markAsRead(id);
  }

  // API để lấy số lượng thông báo chưa đọc của người dùng
  @Get(':userId/unread-count')
  async getUnreadCount(@Param('userId') userId: string): Promise<number> {
    return this.notificationService.getUnreadCount(userId);
  }
}
