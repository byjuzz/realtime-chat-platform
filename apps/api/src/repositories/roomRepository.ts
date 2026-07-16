import type { PrismaClient } from "@prisma/client";

export interface RoomRecord {
  id: string;
  slug: string;
  name: string;
}

export interface IRoomRepository {
  findBySlug(slug: string): Promise<RoomRecord | null>;
}

export class PrismaRoomRepository implements IRoomRepository {
  constructor(private readonly db: PrismaClient) {}

  async findBySlug(slug: string): Promise<RoomRecord | null> {
    return this.db.room.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
  }
}
