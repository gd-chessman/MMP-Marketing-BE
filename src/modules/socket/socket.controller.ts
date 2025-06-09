import { Controller, Get } from '@nestjs/common';
import { SocketService } from './socket.service';

@Controller('socket')
export class SocketController {
  constructor(private readonly socketService: SocketService) {}

  @Get()
  getSocketStatus(): string {
    return 'Socket service is running';
  }
}
