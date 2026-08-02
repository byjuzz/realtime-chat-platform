import type { PrismaClient } from "@prisma/client";

export interface MessageRecord {
  id: string;
  text: string;
  imageData: string | null;
  authorId: string;
  authorName: string;
  roomId: string;
  createdAt: Date;
}

export interface MessageCursor {
  createdAt: Date;
  id: string;
}

export interface IMessageRepository {
  create(params: { text: string; imageData?: string; authorId: string; roomId: string }): Promise<MessageRecord>;
  findRecent(roomId: string, limit: number, before?: MessageCursor): Promise<MessageRecord[]>;
}

export class PrismaMessageRepository implements IMessageRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(params: {
    text: string;
    imageData?: string;
    authorId: string;
    roomId: string;
  }): Promise<MessageRecord> {
    const message = await this.db.message.create({
      data: {
        text: params.text,
        imageData: params.imageData ?? null,
        authorId: params.authorId,
        roomId: params.roomId,
      },
      include: { author: { select: { displayName: true } } },
    });
    return {
      id: message.id,
      text: message.text,
      imageData: message.imageData,
      authorId: message.authorId,
      authorName: message.author.displayName,
      roomId: message.roomId,
      createdAt: message.createdAt,
    };
  }

  /** Retorna hasta `limit` mensajes, más antiguos que `before` si se provee, orden DESC (más reciente primero). */
  async findRecent(
    roomId: string,
    limit: number,
    before?: MessageCursor
  ): Promise<MessageRecord[]> {
    const messages = await this.db.message.findMany({
      where: {
        roomId,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      include: { author: { select: { displayName: true } } },
    });

    return messages.map((message) => ({
      id: message.id,
      text: message.text,
      imageData: message.imageData,
      authorId: message.authorId,
      authorName: message.author.displayName,
      roomId: message.roomId,
      createdAt: message.createdAt,
    }));
  }
}
