import type { PublicUser } from "@realtime-chat/shared";

interface SocketPresence {
  guestUserId: string;
  name: string;
  roomId: string;
}

/**
 * Presencia en memoria, por sala. Cada socket se registra por separado
 * internamente (roomToSockets), pero las vistas públicas (listConsolidated)
 * se agrupan por guestUserId: un mismo invitado con varias pestañas
 * aparece una sola vez en la lista, y solo desaparece cuando su último
 * socket se va de la sala. Ver ADR-005.
 *
 * No se persiste nada de esto: ni socketId, ni roomId activo, ni
 * timestamps de conexión (ver ADR-003/ADR-004).
 */
export class RoomPresenceState {
  private readonly bySocket = new Map<string, SocketPresence>();
  private readonly roomToSockets = new Map<string, Set<string>>();

  getCurrentRoomId(socketId: string): string | undefined {
    return this.bySocket.get(socketId)?.roomId;
  }

  /** El propio guestUserId/name de este socket (a diferencia de listConsolidated, que es la vista pública de todos). */
  getOwnPresence(socketId: string): { guestUserId: string; name: string; roomId: string } | undefined {
    return this.bySocket.get(socketId);
  }

  /**
   * Une el socket a `roomId`, saliendo primero de su sala anterior si
   * tenía una distinta. Retorna la sala anterior (o undefined si no
   * tenía ninguna, o si ya estaba en la misma sala).
   */
  joinRoom(socketId: string, roomId: string, guestUserId: string, name: string): { previousRoomId?: string } {
    const previous = this.bySocket.get(socketId);
    const previousRoomId = previous && previous.roomId !== roomId ? previous.roomId : undefined;

    if (previousRoomId) {
      this.removeFromRoomSet(previousRoomId, socketId);
    }

    this.bySocket.set(socketId, { guestUserId, name, roomId });
    this.addToRoomSet(roomId, socketId);

    return { previousRoomId };
  }

  /** Saca el socket de su sala actual sin unirlo a otra. Retorna la sala de la que salió, si tenía. */
  leaveCurrentRoom(socketId: string): { roomId: string; guestUserId: string; name: string } | undefined {
    const presence = this.bySocket.get(socketId);
    if (!presence) return undefined;
    this.removeFromRoomSet(presence.roomId, socketId);
    this.bySocket.delete(socketId);
    return { roomId: presence.roomId, guestUserId: presence.guestUserId, name: presence.name };
  }

  /** Limpieza total al desconectar. Retorna la sala que ocupaba, si tenía. */
  disconnect(socketId: string): { roomId: string; guestUserId: string; name: string } | undefined {
    return this.leaveCurrentRoom(socketId);
  }

  /** true si, tras la salida de un socket, ningún otro socket del mismo guestUserId sigue en esa sala. */
  isGuestAbsentFromRoom(roomId: string, guestUserId: string): boolean {
    const sockets = this.roomToSockets.get(roomId);
    if (!sockets) return true;
    for (const socketId of sockets) {
      if (this.bySocket.get(socketId)?.guestUserId === guestUserId) return false;
    }
    return true;
  }

  /** Lista consolidada por guestUserId de quién está en `roomId` ahora mismo. */
  listConsolidated(roomId: string): PublicUser[] {
    const sockets = this.roomToSockets.get(roomId);
    if (!sockets) return [];
    const byGuest = new Map<string, PublicUser>();
    for (const socketId of sockets) {
      const presence = this.bySocket.get(socketId);
      if (!presence) continue;
      byGuest.set(presence.guestUserId, {
        id: presence.guestUserId,
        name: presence.name,
        guestUserId: presence.guestUserId,
      });
    }
    return Array.from(byGuest.values());
  }

  /** Cantidad de guestUserId distintos conectados en `roomId`. */
  countConnectedGuests(roomId: string): number {
    return this.listConsolidated(roomId).length;
  }

  /** Cantidad de sockets de este guestUserId específico presentes en `roomId` (para saber si ya tenía otra pestaña ahí). */
  countSocketsForGuestInRoom(roomId: string, guestUserId: string): number {
    const sockets = this.roomToSockets.get(roomId);
    if (!sockets) return 0;
    let count = 0;
    for (const socketId of sockets) {
      if (this.bySocket.get(socketId)?.guestUserId === guestUserId) count++;
    }
    return count;
  }

  private addToRoomSet(roomId: string, socketId: string): void {
    const set = this.roomToSockets.get(roomId) ?? new Set<string>();
    set.add(socketId);
    this.roomToSockets.set(roomId, set);
  }

  private removeFromRoomSet(roomId: string, socketId: string): void {
    const set = this.roomToSockets.get(roomId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) this.roomToSockets.delete(roomId);
  }
}
