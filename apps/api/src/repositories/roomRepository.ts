import { Prisma, type PrismaClient } from "@prisma/client";

export interface RoomRecord {
  id: string;
  slug: string;
  name: string;
  isPrivate: boolean;
  creatorId: string | null;
  createdAt: Date;
}

const ROOM_SELECT = { id: true, slug: true, name: true, isPrivate: true, creatorId: true, createdAt: true } as const;

export const ROOM_SLUG_UNIQUE_VIOLATION = "ROOM_SLUG_UNIQUE_VIOLATION" as const;

export interface IRoomRepository {
  findBySlug(slug: string): Promise<RoomRecord | null>;
  findAll(): Promise<RoomRecord[]>;
  /** Lanza { code: ROOM_SLUG_UNIQUE_VIOLATION } si el slug ya existe (autoridad final: la DB). */
  create(params: { name: string; slug: string; isPrivate: boolean; creatorId: string | null }): Promise<RoomRecord>;
}

export class PrismaRoomRepository implements IRoomRepository {
  constructor(private readonly db: PrismaClient) {}

  async findBySlug(slug: string): Promise<RoomRecord | null> {
    return this.db.room.findUnique({
      where: { slug },
      select: ROOM_SELECT,
    });
  }

  async findAll(): Promise<RoomRecord[]> {
    return this.db.room.findMany({
      orderBy: { createdAt: "asc" },
      select: ROOM_SELECT,
    });
  }

  async create(params: {
    name: string;
    slug: string;
    isPrivate: boolean;
    creatorId: string | null;
  }): Promise<RoomRecord> {
    try {
      return await this.db.room.create({
        data: { name: params.name, slug: params.slug, isPrivate: params.isPrivate, creatorId: params.creatorId },
        select: ROOM_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw Object.assign(new Error("slug already exists"), { code: ROOM_SLUG_UNIQUE_VIOLATION });
      }
      throw error;
    }
  }
}
