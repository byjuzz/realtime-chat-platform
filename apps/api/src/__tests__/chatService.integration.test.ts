import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaGuestUserRepository } from "../repositories/guestUserRepository.js";
import { PrismaRoomRepository } from "../repositories/roomRepository.js";
import { PrismaMessageRepository } from "../repositories/messageRepository.js";
import { ChatService } from "../services/chatService.js";

/**
 * Pruebas de integración contra PostgreSQL real (DATABASE_URL_TEST).
 * No se sustituye por SQLite: deben validar el mismo motor que producción.
 * Requiere que realtime_chat_test exista con las migraciones aplicadas
 * (ver README: npm run db:migrate:deploy con DATABASE_URL_TEST).
 */

const prisma = new PrismaClient();
let chatService: ChatService;
let generalRoomId: string;

beforeAll(async () => {
  const generalRoom = await prisma.room.upsert({
    where: { slug: "general" },
    update: {},
    create: { slug: "general", name: "General" },
  });
  generalRoomId = generalRoom.id;

  const guestUsers = new PrismaGuestUserRepository(prisma);
  const rooms = new PrismaRoomRepository(prisma);
  const messages = new PrismaMessageRepository(prisma);
  chatService = new ChatService(guestUsers, rooms, messages);
});

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.guestUser.deleteMany();
  // Limpieza sin migrate reset: se borran solo las salas creadas durante
  // las pruebas, preservando siempre la sala general sembrada en beforeAll.
  await prisma.room.deleteMany({ where: { slug: { not: "general" } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("persistencia real con PostgreSQL - identidad y mensajes", () => {
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
      roomId: generalRoomId,
    });
    expect(sent.ok).toBe(true);

    const stored = await prisma.message.findFirst({
      where: { text: "hola desde integración" },
      include: { author: true, room: true },
    });
    expect(stored?.author.id).toBe(guest.guestUserId);
    expect(stored?.room.slug).toBe("general");
  });

  it("los mensajes sobreviven a una nueva instancia de PrismaClient (simula reinicio de la API)", async () => {
    const guest = await chatService.resolveGuestUser("Ada");
    if (!guest.ok) throw new Error("setup failed");
    await chatService.sendMessage({
      text: "sobrevive al reinicio",
      guestUserId: guest.guestUserId,
      roomId: generalRoomId,
    });

    const freshClient = new PrismaClient();
    const found = await freshClient.message.findFirst({ where: { text: "sobrevive al reinicio" } });
    expect(found).not.toBeNull();
    await freshClient.$disconnect();
  });
});

describe("persistencia real con PostgreSQL - salas múltiples", () => {
  it("crea varias salas con slugs únicos", async () => {
    const a = await chatService.createRoom("Tecnología", "tecnologia");
    const b = await chatService.createRoom("Deportes", "deportes");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("rechaza un slug duplicado con SLUG_CONFLICT, aun ante inserciones concurrentes", async () => {
    const [first, second] = await Promise.all([
      chatService.createRoom("Tecnología", "tecnologia"),
      chatService.createRoom("Tecnología (otra)", "tecnologia"),
    ]);
    const results = [first, second];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok);
    if (failed && !failed.ok) expect(failed.reason).toBe("SLUG_CONFLICT");
  });

  it("lista todas las salas, incluida la general", async () => {
    await chatService.createRoom("Tecnología", "tecnologia");
    const rooms = await chatService.listRooms();
    expect(rooms.some((r) => r.slug === "general")).toBe(true);
    expect(rooms.some((r) => r.slug === "tecnologia")).toBe(true);
  });

  it("recupera una sala por slug", async () => {
    await chatService.createRoom("Tecnología", "tecnologia");
    const room = await chatService.findRoomBySlug("tecnologia");
    expect(room?.name).toBe("Tecnología");
  });

  it("aísla los mensajes de salas diferentes, cada uno con su propio historial paginado", async () => {
    const guest = await chatService.resolveGuestUser("Ada");
    if (!guest.ok) throw new Error("setup failed");
    const tech = await chatService.createRoom("Tecnología", "tecnologia");
    if (!tech.ok) throw new Error("setup failed");

    await chatService.sendMessage({ text: "en general", guestUserId: guest.guestUserId, roomId: generalRoomId });
    await chatService.sendMessage({ text: "en tecnologia 1", guestUserId: guest.guestUserId, roomId: tech.room.id });
    await chatService.sendMessage({ text: "en tecnologia 2", guestUserId: guest.guestUserId, roomId: tech.room.id });

    const generalHistory = await chatService.getHistory("general", 50);
    const techHistory = await chatService.getHistory("tecnologia", 50);
    expect(generalHistory.ok && techHistory.ok).toBe(true);
    if (generalHistory.ok && techHistory.ok) {
      expect(generalHistory.page.messages.map((m) => m.text)).toEqual(["en general"]);
      expect(techHistory.page.messages.map((m) => m.text)).toEqual(["en tecnologia 1", "en tecnologia 2"]);
    }
  });

  it("mantiene integridad referencial: los mensajes de una sala apuntan al roomId correcto", async () => {
    const guest = await chatService.resolveGuestUser("Ada");
    if (!guest.ok) throw new Error("setup failed");
    const tech = await chatService.createRoom("Tecnología", "tecnologia");
    if (!tech.ok) throw new Error("setup failed");

    await chatService.sendMessage({ text: "hola", guestUserId: guest.guestUserId, roomId: tech.room.id });

    const stored = await prisma.message.findFirst({ where: { text: "hola" } });
    expect(stored?.roomId).toBe(tech.room.id);
  });
});
