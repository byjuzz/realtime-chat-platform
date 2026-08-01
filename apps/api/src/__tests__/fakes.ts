import { randomUUID } from "node:crypto";
import type { GuestUserRecord, IGuestUserRepository } from "../repositories/guestUserRepository.js";
import { ROOM_SLUG_UNIQUE_VIOLATION, type IRoomRepository, type RoomRecord } from "../repositories/roomRepository.js";
import type {
  IMessageRepository,
  MessageCursor,
  MessageRecord,
} from "../repositories/messageRepository.js";

export class FakeGuestUserRepository implements IGuestUserRepository {
  private readonly users = new Map<string, GuestUserRecord>();

  async findById(id: string): Promise<GuestUserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async create(displayName: string): Promise<GuestUserRecord> {
    const user: GuestUserRecord = { id: randomUUID(), displayName };
    this.users.set(user.id, user);
    return user;
  }

  async updateDisplayName(id: string, displayName: string): Promise<GuestUserRecord> {
    const existing = this.users.get(id);
    if (!existing) throw new Error("not found");
    const updated = { ...existing, displayName };
    this.users.set(id, updated);
    return updated;
  }
}

export class FakeRoomRepository implements IRoomRepository {
  private readonly rooms: RoomRecord[];

  constructor(
    seed: RoomRecord[] = [
      { id: "room-general", slug: "general", name: "General", isPrivate: false, creatorId: null, createdAt: new Date(0) },
    ]
  ) {
    this.rooms = seed;
  }

  async findBySlug(slug: string): Promise<RoomRecord | null> {
    return this.rooms.find((room) => room.slug === slug) ?? null;
  }

  async findAll(): Promise<RoomRecord[]> {
    return [...this.rooms].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async create(params: { name: string; slug: string; isPrivate: boolean; creatorId: string | null }): Promise<RoomRecord> {
    if (this.rooms.some((room) => room.slug === params.slug)) {
      throw Object.assign(new Error("slug already exists"), { code: ROOM_SLUG_UNIQUE_VIOLATION });
    }
    const room: RoomRecord = {
      id: randomUUID(),
      name: params.name,
      slug: params.slug,
      isPrivate: params.isPrivate,
      creatorId: params.creatorId,
      createdAt: new Date(),
    };
    this.rooms.push(room);
    return room;
  }
}

export class FakeMessageRepository implements IMessageRepository {
  private readonly messages: MessageRecord[] = [];
  public failNextCreate = false;

  constructor(private readonly guestUsers: FakeGuestUserRepository) {}

  async create(params: { text: string; authorId: string; roomId: string }): Promise<MessageRecord> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error("simulated persistence failure");
    }
    const author = await this.guestUsers.findById(params.authorId);
    const record: MessageRecord = {
      id: randomUUID(),
      text: params.text,
      authorId: params.authorId,
      authorName: author?.displayName ?? "unknown",
      roomId: params.roomId,
      createdAt: new Date(),
    };
    this.messages.push(record);
    return record;
  }

  async findRecent(roomId: string, limit: number, before?: MessageCursor): Promise<MessageRecord[]> {
    let filtered = this.messages.filter((m) => m.roomId === roomId);
    if (before) {
      filtered = filtered.filter(
        (m) => m.createdAt < before.createdAt || (m.createdAt.getTime() === before.createdAt.getTime() && m.id < before.id)
      );
    }
    return filtered
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, limit);
  }
}
