import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  namespace: '/bookings',
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
export class BookingsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('BookingsGateway');

  // Map userId → Set of socket IDs
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract JWT from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        'handy-dev-secret-change-in-production';
      const payload = this.jwtService.verify(token, { secret });
      const userId = payload.sub;

      // Store socket → user mapping
      (client as any).userId = userId;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      // Join a personal room for targeted notifications
      client.join(`user:${userId}`);

      this.logger.log(
        `User ${userId} connected (socket: ${client.id})`,
      );
    } catch {
      this.logger.warn(`Client ${client.id} invalid token, disconnecting`);
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
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Send a booking status update to a specific user.
   */
  sendBookingUpdate(userId: string, booking: Record<string, unknown>) {
    this.server.to(`user:${userId}`).emit('booking:updated', booking);
    this.logger.log(
      `Sent booking:updated to user ${userId} (booking: ${booking.id})`,
    );
  }

  /**
   * Notify both participants of a booking that status has changed.
   */
  notifyBookingParticipants(
    customerId: string,
    providerUserId: string | undefined,
    booking: Record<string, unknown>,
  ) {
    this.sendBookingUpdate(customerId, booking);
    if (providerUserId) {
      this.sendBookingUpdate(providerUserId, booking);
    }
  }
}


