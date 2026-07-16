import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaGuestUserRepository } from "../repositories/guestUserRepository.js";
import { PrismaRoomRepository } from "../repositories/roomRepository.js";
import { PrismaMessageRepository } from "../repositories/messageRepository.js";
import { ChatService } from "../services/chatService.js";

/**
 * Pruebas de integración contra PostgreSQL real (DATABASE_URL_TEST).
 * No se sustituye por SQLite: deben validar el mismo motor que produción.
 * Requiere que realtime_chat_test exista con las migraciones aplicadas
 * (ver README: npm run db:migrate:deploy con DATABASE_URL_TEST).
 */

const prisma = new PrismaClient();
let chatService: ChatService;

beforeAll(async () => {
  await prisma.room.upsert({
    where: { slug: "general" },
    update: {},
    create: { slug: "general", name: "General" },
  });

  const guestUsers = new PrismaGuestUserRepository(prisma);
  const rooms = new PrismaRoomRepository(prisma);
  const messages = new PrismaMessageRepository(prisma);
  chatService = new ChatService(guestUsers, rooms, messages);
});

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.guestUser.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("persistencia real con PostgreSQL", () => {
  it("crea y encuentra la sala general", async () => {
    const room = await prisma.room.findUnique({ where: { slug: "general" } });
    expect(room).not.toBeNull();
    expect(room?.name).toBe("General");
  });

  it("persiste un GuestUser", async () => {
    const result = await chatService.resolveGuestUser("Ada");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const stored = await prisma.guestUser.findUnique({ where: { id: result.guestUserId } });
      expect(stored?.displayName).toBe("Ada");
    }
  });

  it("persiste un Message y respeta la relación con GuestUser y Room", async () => {
    const guest = await chatService.resolveGuestUser("Ada");
    if (!guest.ok) throw new Error("setup failed");

    const sent = await chatService.sendMessage({
      text: "hola desde integración",
      guestUserId: guest.guestUserId,
      roomSlug: "general",
    });
    expect(sent.ok).toBe(true);

    const stored = await prisma.message.findFirst({
      where: { text: "hola desde integración" },
      include: { author: true, room: true },
    });
    expect(stored?.author.id).toBe(guest.guestUserId);
    expect(stored?.room.slug).toBe("general");
  });

  it("recupera mensajes recientes en orden cronológico", async () => {
    const guest = await chatService.resolveGuestUser("Ada");
    if (!guest.ok) throw new Error("setup failed");

    await chatService.sendMessage({ text: "uno", guestUserId: guest.guestUserId, roomSlug: "general" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await chatService.sendMessage({ text: "dos", guestUserId: guest.guestUserId, roomSlug: "general" });

    const history = await chatService.getHistory("general", 50);
    expect(history.ok).toBe(true);
    if (history.ok) {
      expect(history.page.messages.map((m) => m.text)).toEqual(["uno", "dos"]);
    }
  });

  it("pagina por cursor sin duplicar ni saltar mensajes", async () => {
    const guest = await chatService.resolveGuestUser("Ada");
    if (!guest.ok) throw new Error("setup failed");

    for (let i = 0; i < 5; i++) {
      await chatService.sendMessage({ text: `msg-${i}`, guestUserId: guest.guestUserId, roomSlug: "general" });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const firstPage = await chatService.getHistory("general", 2);
    expect(firstPage.ok).toBe(true);
    if (!firstPage.ok) return;
    expect(firstPage.page.messages).toHaveLength(2);
    expect(firstPage.page.hasMore).toBe(true);

    const cursor = firstPage.page.nextCursor;
    expect(cursor).not.toBeNull();
    if (!cursor) return;

    const secondPage = await chatService.getHistory("general", 2, cursor);
    expect(secondPage.ok).toBe(true);
    if (!secondPage.ok) return;

    const firstIds = firstPage.page.messages.map((m) => m.id);
    const secondIds = secondPage.page.messages.map((m) => m.id);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it("los mensajes sobreviven a una nueva instancia de PrismaClient (simula reinicio de la API)", async () => {
    const guest = await chatService.resolveGuestUser("Ada");
    if (!guest.ok) throw new Error("setup failed");
    await chatService.sendMessage({
      text: "sobrevive al reinicio",
      guestUserId: guest.guestUserId,
      roomSlug: "general",
    });

    const freshClient = new PrismaClient();
    const found = await freshClient.message.findFirst({ where: { text: "sobrevive al reinicio" } });
    expect(found).not.toBeNull();
    await freshClient.$disconnect();
  });
});
