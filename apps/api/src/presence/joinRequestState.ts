import type { PublicUser } from "@realtime-chat/shared";

export interface PendingJoinRequest {
  requestId: string;
  roomId: string;
  roomSlug: string;
  creatorId: string;
  requesterSocketId: string;
  requester: PublicUser;
  expiresAt: number;
}

/**
 * Solicitudes de ingreso a salas privadas, pendientes de que el creador las
 * apruebe o rechace. En memoria únicamente (igual que RoomPresenceState):
 * si el proceso se reinicia, las solicitudes en curso se pierden y quien
 * las hizo debe volver a pedir ingreso.
 */
export class JoinRequestState {
  private readonly byId = new Map<string, PendingJoinRequest & { timeout: NodeJS.Timeout }>();

  create(
    params: Omit<PendingJoinRequest, "requestId" | "expiresAt">,
    ttlMs: number,
    onExpire: (request: PendingJoinRequest) => void
  ): PendingJoinRequest {
    const requestId = crypto.randomUUID();
    const expiresAt = Date.now() + ttlMs;
    const timeout = setTimeout(() => {
      const request = this.byId.get(requestId);
      if (!request) return;
      this.byId.delete(requestId);
      onExpire(request);
    }, ttlMs);
    // No debe mantener vivo el proceso solo por este timer.
    timeout.unref?.();

    const request = { ...params, requestId, expiresAt, timeout };
    this.byId.set(requestId, request);
    return request;
  }

  get(requestId: string): PendingJoinRequest | undefined {
    return this.byId.get(requestId);
  }

  resolve(requestId: string): PendingJoinRequest | undefined {
    const request = this.byId.get(requestId);
    if (!request) return undefined;
    clearTimeout(request.timeout);
    this.byId.delete(requestId);
    return request;
  }

  /** Cancela cualquier solicitud pendiente hecha por este socket (p. ej. al desconectarse). */
  deleteByRequesterSocket(requesterSocketId: string): void {
    for (const [requestId, request] of this.byId) {
      if (request.requesterSocketId === requesterSocketId) {
        clearTimeout(request.timeout);
        this.byId.delete(requestId);
      }
    }
  }
}
