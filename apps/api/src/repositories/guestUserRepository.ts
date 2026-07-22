import type { PrismaClient } from "@prisma/client";

export interface GuestUserRecord {
  id: string;
  displayName: string;
}

export interface IGuestUserRepository {
  findById(id: string): Promise<GuestUserRecord | null>;
  create(displayName: string): Promise<GuestUserRecord>;
  updateDisplayName(id: string, displayName: string): Promise<GuestUserRecord>;
}

export class PrismaGuestUserRepository implements IGuestUserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: string): Promise<GuestUserRecord | null> {
    return this.db.guestUser.findUnique({
      where: { id },
      select: { id: true, displayName: true },
    });
  }

  async create(displayName: string): Promise<GuestUserRecord> {
    return this.db.guestUser.create({
      data: { displayName },
      select: { id: true, displayName: true },
    });
  }

  async updateDisplayName(id: string, displayName: string): Promise<GuestUserRecord> {
    return this.db.guestUser.update({
      where: { id },
      data: { displayName },
      select: { id: true, displayName: true },
    });
  }
}
