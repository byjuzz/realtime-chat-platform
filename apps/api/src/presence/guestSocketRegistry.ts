/**
 * Mapeo global guestUserId <-> socketId, independiente de en qué sala esté
 * cada socket ahora mismo (a diferencia de RoomPresenceState, que solo sabe
 * de la sala activa). Se usa para poder notificar a alguien (p. ej. al
 * creador de una sala privada) aunque no esté "dentro" de esa sala en este
 * momento. No se persiste: se reconstruye en cada `room:join` y se limpia
 * al desconectar.
 */
export class GuestSocketRegistry {
  private readonly socketsByGuest = new Map<string, Set<string>>();
  private readonly guestBySocket = new Map<string, string>();

  register(socketId: string, guestUserId: string): void {
    this.guestBySocket.set(socketId, guestUserId);
    const set = this.socketsByGuest.get(guestUserId) ?? new Set<string>();
    set.add(socketId);
    this.socketsByGuest.set(guestUserId, set);
  }

  unregister(socketId: string): void {
    const guestUserId = this.guestBySocket.get(socketId);
    if (!guestUserId) return;
    this.guestBySocket.delete(socketId);
    const set = this.socketsByGuest.get(guestUserId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) this.socketsByGuest.delete(guestUserId);
  }

  getSocketIds(guestUserId: string): string[] {
    return Array.from(this.socketsByGuest.get(guestUserId) ?? []);
  }
}
