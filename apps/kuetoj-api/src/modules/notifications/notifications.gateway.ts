import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // userId -> Set of socket ids
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace(
          'Bearer ',
          '',
        );

      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);

      const sockets = this.userSockets.get(payload.sub) ?? new Set();
      sockets.add(client.id);
      this.userSockets.set(payload.sub, sockets);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.userSockets.delete(userId);
      }
    }
  }

  /** Push a notification to a specific user (all their tabs) */
  sendToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /** Push a contest announcement to all participants in that contest room */
  sendToContest(contestId: string, event: string, data: unknown) {
    this.server.to(`contest:${contestId}`).emit(event, data);
  }

  @SubscribeMessage('join-contest')
  handleJoinContest(
    @ConnectedSocket() client: Socket,
    @MessageBody() contestId: string,
  ) {
    client.join(`contest:${contestId}`);
  }

  @SubscribeMessage('leave-contest')
  handleLeaveContest(
    @ConnectedSocket() client: Socket,
    @MessageBody() contestId: string,
  ) {
    client.leave(`contest:${contestId}`);
  }
}
