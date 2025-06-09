import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';


@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  // Tạo mới một thông báo
  async createNotification(title: string, content: string, userId: string): Promise<Notification> {
    const newNotification = this.notificationRepository.create({
      title,
      content,
      user: { id: userId }
    });
    return this.notificationRepository.save(newNotification);
  }

  // Lấy tất cả thông báo của người dùng
  async getNotifications(userId: string, page: number = 1, limit: number = 100): Promise<{ data: Notification[]; total: number; currentPage: number; totalPages: number }> {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.notificationRepository.find({
        where: { user: { id: userId } },
        relations: ['user'],
        order: { createdAt: 'DESC' },
        skip,
        take: limit
      }),
      this.notificationRepository.count({
        where: { user: { id: userId } }
      })
    ]);

    return {
      data,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit)
    };
  }
  

  // Đánh dấu thông báo là đã đọc
  async markAsRead(notificationId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId }
    });
    
    if (notification) {
      notification.isRead = true;
      return this.notificationRepository.save(notification);
    }
    
    return null;
  }

  // Lấy số lượng thông báo chưa đọc của người dùng
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: {
        user: { id: userId },
        isRead: false
      }
    });
  }
}
