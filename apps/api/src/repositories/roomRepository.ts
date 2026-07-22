import { Prisma, type PrismaClient } from "@prisma/client";

export interface RoomRecord {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
}

export const ROOM_SLUG_UNIQUE_VIOLATION = "ROOM_SLUG_UNIQUE_VIOLATION" as const;

export interface IRoomRepository {
  findBySlug(slug: string): Promise<RoomRecord | null>;
  findAll(): Promise<RoomRecord[]>;
  /** Lanza { code: ROOM_SLUG_UNIQUE_VIOLATION } si el slug ya existe (autoridad final: la DB). */
  create(params: { name: string; slug: string }): Promise<RoomRecord>;
}

export class PrismaRoomRepository implements IRoomRepository {
  constructor(private readonly db: PrismaClient) {}

  async findBySlug(slug: string): Promise<RoomRecord | null> {
    return this.db.room.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, createdAt: true },
    });
  }

  async findAll(): Promise<RoomRecord[]> {
    return this.db.room.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true, createdAt: true },
    });
  }

  async create(params: { name: string; slug: string }): Promise<RoomRecord> {
    try {
      return await this.db.room.create({
        data: { name: params.name, slug: params.slug },
        select: { id: true, slug: true, name: true, createdAt: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw Object.assign(new Error("slug already exists"), { code: ROOM_SLUG_UNIQUE_VIOLATION });
      }
      throw error;
    }
  }
}
