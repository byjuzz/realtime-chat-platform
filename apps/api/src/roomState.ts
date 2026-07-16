import type { PublicUser } from "@realtime-chat/shared";
import { VALIDATION } from "@realtime-chat/shared";

/**
 * Estado en memoria del MVP. Ver ADR-003: se pierde al reiniciar el
 * proceso, es una decisión temporal, no un descuido.
 */
export class RoomState {
  private readonly usersBySocketId = new Map<string, PublicUser>();
  private readonly messageTimestampsBySocketId = new Map<string, number[]>();

  hasJoined(socketId: string): boolean {
    return this.usersBySocketId.has(socketId);
  }

  join(socketId: string, name: string, guestUserId: string): PublicUser {
    const user: PublicUser = { id: socketId, name, guestUserId };
    this.usersBySocketId.set(socketId, user);
    return user;
  }

  leave(socketId: string): PublicUser | undefined {
    const user = this.usersBySocketId.get(socketId);
    this.usersBySocketId.delete(socketId);
    this.messageTimestampsBySocketId.delete(socketId);
    return user;
  }

  getUser(socketId: string): PublicUser | undefined {
    return this.usersBySocketId.get(socketId);
  }

  listUsers(): PublicUser[] {
    return Array.from(this.usersBySocketId.values());
  }

  /** true si el socket puede enviar un mensaje ahora (dentro del límite de frecuencia). */
  registerMessageAndCheckRateLimit(socketId: string, now: number): boolean {
    const windowStart = now - VALIDATION.RATE_LIMIT_WINDOW_MS;
    const timestamps = (this.messageTimestampsBySocketId.get(socketId) ?? []).filter(
      (ts) => ts > windowStart
    );

    if (timestamps.length >= VALIDATION.RATE_LIMIT_MAX_MESSAGES) {
      this.messageTimestampsBySocketId.set(socketId, timestamps);
      return false;
    }

    timestamps.push(now);
    this.messageTimestampsBySocketId.set(socketId, timestamps);
    return true;
  }
}
