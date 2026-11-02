import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { verify } from 'jsonwebtoken';
import { getAuthConfig } from '../identity-rbac/auth.config';

interface WsAuth {
  userId: string;
  companyId: string;
}

interface AccessPayload {
  sub: string;
  sid: string;
  cid: string;
  typ: 'access';
  exp?: number;
}

/**
 * مسیرهای مجاز برای اتصال وب‌سوکت — از env خوانده می‌شود (پیش‌فرض توسعه
 * لوکال). پیکربندی در زمان راه‌اندازی خوانده می‌شود نه در لحظهٔ اتصال.
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * گیت‌وی رهگیری زنده — فاز B: احراز هویت واقعی + جدایی اتاق‌ها.
 *
 * - اتصال بدون توکن دسترسی معتبر قطع می‌شود (پیش‌تر همه بدون هویت به اتاق live
 *   مشترک همهٔ شرکت‌ها می‌پیوستند و origin هم '*' بود)؛
 * - هر کاربر فقط اتاق company:{companyId} خودش را دارد؛ join دستی به اتاق
 *   دیگر نادیده گرفته می‌شود و رویداد location همیشه در همان اتاق منتشر
 *   می‌شود — کلاینت نمی‌تواند دادهٔ شرکت دیگری را ببیند یا بنویسد؛
 * - هویت از خودِ توکن گرفته می‌شود (cid = شرکت)، نه از بدنهٔ پیام.
 */
@WebSocketGateway({ cors: { origin: allowedOrigins, credentials: true }, namespace: '/tracking' })
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('TrackingGateway');

  private static room(companyId: string): string {
    return `company:${companyId}`;
  }

  handleConnection(client: Socket): void {
    const handshake = client.handshake as unknown as {
      auth?: { token?: unknown };
      headers?: Record<string, string | string[] | undefined>;
    };
    const raw = handshake.auth?.token ?? handshake.headers?.authorization;
    const token =
      typeof raw === 'string' ? (raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw) : null;

    if (!token) {
      client.emit('error', { code: 'unauthorized', message_fa: 'برای مشاهده موقعیت زنده باید وارد شوید.' });
      client.disconnect(true);
      return;
    }

    let payload: AccessPayload;
    try {
      payload = verify(token, getAuthConfig().secret, { algorithms: ['HS256'] }) as AccessPayload;
    } catch {
      client.emit('error', { code: 'unauthorized', message_fa: 'توکن نامعتبر یا منقضی است؛ دوباره وارد شوید.' });
      client.disconnect(true);
      return;
    }
    if (payload.typ !== 'access' || !payload.sub || !payload.cid) {
      client.emit('error', { code: 'unauthorized', message_fa: 'توکن دسترسی معتبر نیست.' });
      client.disconnect(true);
      return;
    }

    const auth: WsAuth = { userId: payload.sub, companyId: payload.cid };
    (client.data as { auth?: WsAuth }).auth = auth;
    client.join(TrackingGateway.room(auth.companyId));
    client.emit('connected', { status: 'ok', room: TrackingGateway.room(auth.companyId) });
  }

  handleDisconnect(client: Socket): void {
    const auth = (client.data as { auth?: WsAuth }).auth;
    if (auth) client.leave(TrackingGateway.room(auth.companyId));
  }

  /**
   * پیوستن — فقط به اتاق شرکت خودِ کاربر؛ هر room دیگری نادیده گرفته می‌شود
   * تا امکان شنود جریان شرکت دیگر وجود نداشته باشد.
   */
  @SubscribeMessage('join')
  handleJoin(@ConnectedSocket() client: Socket): { joined: string } | { error: string } {
    const auth = (client.data as { auth?: WsAuth }).auth;
    if (!auth) return { error: 'unauthorized' };
    const room = TrackingGateway.room(auth.companyId);
    client.join(room);
    return { joined: room };
  }

  /** انتشار موقعیت — هویت از نشست سوکت گرفته می‌شود، نه از بدنهٔ کلاینت */
  @SubscribeMessage('location')
  handleLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: Record<string, unknown>,
  ): { ack: true } | { error: string } {
    const auth = (client.data as { auth?: WsAuth }).auth;
    if (!auth) return { error: 'unauthorized' };
    this.server
      .to(TrackingGateway.room(auth.companyId))
      .emit('location', { ...data, userId: auth.userId, companyId: auth.companyId });
    return { ack: true };
  }

  /** انتشار از سمت سرور — همیشه به اتاق شرکتِ سند موردنظر */
  broadcastLocation(companyId: string, payload: unknown): void {
    if (!companyId) return;
    this.server.to(TrackingGateway.room(companyId)).emit('location', payload);
  }
}
