import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin:
      process.env.NODE_ENV === 'production'
        ? [
            process.env.FRONTEND_URL,
            /https:\/\/.*\.vercel\.app$/,
          ].filter(Boolean)
        : ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
  },
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('MessagesGateway');

  // userId → Set of socket IDs
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Chat client ${client.id} no token`);
        client.disconnect();
        return;
      }

      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        'handy-dev-secret-change-in-production';
      const payload = this.jwtService.verify(token, { secret });
      const userId = payload.sub;

      (client as any).userId = userId;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      // Join personal room
      client.join(`user:${userId}`);

      this.logger.log(`Chat: user ${userId} connected (${client.id})`);
    } catch {
      this.logger.warn(`Chat client ${client.id} invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Chat client disconnected: ${client.id}`);
  }

  /**
   * Client joins a booking chat room to receive messages for that booking.
   */
  @SubscribeMessage('chat:join')
  handleJoinChat(client: Socket, payload: { bookingId: string }) {
    const bookingRoom = `booking:${payload.bookingId}`;
    client.join(bookingRoom);
    this.logger.log(
      `User ${(client as any).userId} joined chat room ${bookingRoom}`,
    );
    return { event: 'chat:joined', data: { bookingId: payload.bookingId } };
  }

  /**
   * Client leaves a booking chat room.
   */
  @SubscribeMessage('chat:leave')
  handleLeaveChat(client: Socket, payload: { bookingId: string }) {
    const bookingRoom = `booking:${payload.bookingId}`;
    client.leave(bookingRoom);
    this.logger.log(
      `User ${(client as any).userId} left chat room ${bookingRoom}`,
    );
    return { event: 'chat:left', data: { bookingId: payload.bookingId } };
  }

  /**
   * Typing indicator.
   */
  @SubscribeMessage('chat:typing')
  handleTyping(
    client: Socket,
    payload: { bookingId: string; isTyping: boolean },
  ) {
    const bookingRoom = `booking:${payload.bookingId}`;
    client.to(bookingRoom).emit('chat:typing', {
      bookingId: payload.bookingId,
      userId: (client as any).userId,
      isTyping: payload.isTyping,
    });
  }

  // ─── Server-side emit methods ──────────────────────────────

  /**
   * Send a new message to everyone in the booking room.
   */
  sendNewMessage(bookingId: string, message: Record<string, unknown>) {
    this.server
      .to(`booking:${bookingId}`)
      .emit('message:new', message);
    this.logger.log(`Emitted message:new to booking:${bookingId}`);
  }

  /**
   * Send a new message to a specific user (e.g. when they're not in the room yet).
   */
  sendMessageToUser(userId: string, message: Record<string, unknown>) {
    this.server.to(`user:${userId}`).emit('message:new', message);
  }

  /**
   * Notify a user of the message read status.
   */
  sendReadReceipt(
    bookingId: string,
    readBy: string,
    readAt: string,
  ) {
    this.server.to(`booking:${bookingId}`).emit('message:read', {
      bookingId,
      readBy,
      readAt,
    });
  }
}

