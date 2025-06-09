import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000'], // Cho phép từ nhiều nguồn
  },
})
export class SocketGateway {
  private server: Server;

  // Đảm bảo server được khởi tạo sau khi WebSocketGateway được khởi tạo
  afterInit(server: Server) {
    this.server = server;
  }

  // Phương thức để gửi thông báo contact mới đến tất cả client
  sendNewNotification(newNotification: any) {
    // Sử dụng phương thức emit để phát sự kiện đến tất cả client
    this.server.emit('notification', { message: `Thông báo mới: ${newNotification}` });
  }

  @SubscribeMessage('message')
  handleMessage(@MessageBody() data: string): string {
    return `Message received: ${data}`;
  }
}
