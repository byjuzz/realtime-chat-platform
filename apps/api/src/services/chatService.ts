import type { ChatMessage, PublicUser } from "@realtime-chat/shared";
import type { IGuestUserRepository } from "../repositories/guestUserRepository.js";
import type { IRoomRepository } from "../repositories/roomRepository.js";
import type { IMessageRepository, MessageCursor } from "../repositories/messageRepository.js";

export const GENERAL_ROOM_SLUG = "general";

export type JoinResult =
  | { ok: true; guestUserId: string }
  | { ok: false; reason: "PERSISTENCE_FAILED" };

export type SendMessageResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; reason: "PERSISTENCE_FAILED" };

export interface HistoryPage {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: MessageCursor | null;
}

/**
 * Orquesta las reglas de negocio de persistencia. Ni socket.ts ni las
 * rutas REST llaman a Prisma directamente; todas pasan por aquí.
 */
export class ChatService {
  constructor(
    private readonly guestUsers: IGuestUserRepository,
    private readonly rooms: IRoomRepository,
    private readonly messages: IMessageRepository
  ) {}

  /**
   * Resuelve la identidad invitada: reutiliza el GuestUser existente si
   * `guestUserId` fue provisto y existe, o crea uno nuevo en cualquier
   * otro caso (guestUserId ausente, o no encontrado -> no es un error,
   * es continuidad de conveniencia, ver ADR-004).
   */
  async resolveGuestUser(displayName: string, guestUserId?: string): Promise<JoinResult> {
    try {
      if (guestUserId) {
        const existing = await this.guestUsers.findById(guestUserId);
        if (existing) {
          await this.guestUsers.updateDisplayName(existing.id, displayName);
          return { ok: true, guestUserId: existing.id };
        }
      }
      const created = await this.guestUsers.create(displayName);
      return { ok: true, guestUserId: created.id };
    } catch {
      return { ok: false, reason: "PERSISTENCE_FAILED" };
    }
  }

  async sendMessage(params: {
    text: string;
    guestUserId: string;
    roomSlug: string;
  }): Promise<SendMessageResult> {
    try {
      const room = await this.rooms.findBySlug(params.roomSlug);
      if (!room) {
        return { ok: false, reason: "PERSISTENCE_FAILED" };
      }

      const record = await this.messages.create({
        text: params.text,
        authorId: params.guestUserId,
        roomId: room.id,
      });

      const message: ChatMessage = {
        id: record.id,
        authorId: record.authorId,
        authorName: record.authorName,
        text: record.text,
        ts: record.createdAt.getTime(),
      };

      return { ok: true, message };
    } catch {
      return { ok: false, reason: "PERSISTENCE_FAILED" };
    }
  }

  async getHistory(
    roomSlug: string,
    limit: number,
    before?: MessageCursor
  ): Promise<
    | { ok: true; room: { slug: string; name: string }; page: HistoryPage }
    | { ok: false; reason: "ROOM_NOT_FOUND" }
  > {
    const room = await this.rooms.findBySlug(roomSlug);
    if (!room) {
      return { ok: false, reason: "ROOM_NOT_FOUND" };
    }

    const records = await this.messages.findRecent(room.id, limit + 1, before);
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;

    const messages: ChatMessage[] = page
      .map((record) => ({
        id: record.id,
        authorId: record.authorId,
        authorName: record.authorName,
        text: record.text,
        ts: record.createdAt.getTime(),
      }))
      .reverse(); // de DESC (más reciente primero) a ASC (orden cronológico)

    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

    return {
      ok: true,
      room: { slug: room.slug, name: room.name },
      page: { messages, hasMore, nextCursor },
    };
  }
}

export function toPublicUser(socketId: string, name: string, guestUserId: string): PublicUser {
  return { id: socketId, name, guestUserId };
}
