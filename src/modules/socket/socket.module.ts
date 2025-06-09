import { Module } from '@nestjs/common';
import { SocketService } from './socket.service';
import { SocketGateway } from './socket.gateway';
import { SocketController } from './socket.controller';

@Module({
  providers: [SocketService, SocketGateway],
  controllers: [SocketController],
  exports: [SocketGateway],  
})
export class SocketModule {}
