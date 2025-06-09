import { Injectable } from '@nestjs/common';

@Injectable()
export class SocketService {
  processMessage(data: string): string {
    // Xử lý dữ liệu và trả về kết quả
    return `Message received: ${data}`;
  }
  
  processNewContact(data: string): string {
    // Xử lý new contact
    return `New contact processed: ${data}`;
  }
}
