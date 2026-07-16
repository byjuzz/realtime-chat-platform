import { VALIDATION } from "@realtime-chat/shared";

/** Límite de frecuencia de mensajes por socket, en memoria. Independiente de la sala activa. */
export class SocketRateLimiter {
  private readonly timestampsBySocketId = new Map<string, number[]>();

  /** true si el socket puede enviar un mensaje ahora (dentro del límite de frecuencia). */
  registerAndCheck(socketId: string, now: number): boolean {
    const windowStart = now - VALIDATION.RATE_LIMIT_WINDOW_MS;
    const timestamps = (this.timestampsBySocketId.get(socketId) ?? []).filter((ts) => ts > windowStart);

    if (timestamps.length >= VALIDATION.RATE_LIMIT_MAX_MESSAGES) {
      this.timestampsBySocketId.set(socketId, timestamps);
      return false;
    }

    timestamps.push(now);
    this.timestampsBySocketId.set(socketId, timestamps);
    return true;
  }

  clear(socketId: string): void {
    this.timestampsBySocketId.delete(socketId);
  }
}
