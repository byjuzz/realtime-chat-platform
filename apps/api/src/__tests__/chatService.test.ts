import { beforeEach, describe, expect, it } from "vitest";
import { ChatService } from "../services/chatService.js";
import { FakeGuestUserRepository, FakeMessageRepository, FakeRoomRepository } from "./fakes.js";

let guestUsers: FakeGuestUserRepository;
let rooms: FakeRoomRepository;
let messages: FakeMessageRepository;
let chatService: ChatService;
let generalRoomId: string;

beforeEach(async () => {
  guestUsers = new FakeGuestUserRepository();
  rooms = new FakeRoomRepository();
  messages = new FakeMessageRepository(guestUsers);
  chatService = new ChatService(guestUsers, rooms, messages);
  generalRoomId = (await rooms.findBySlug("general"))!.id;
});

describe("ChatService.resolveGuestUser", () => {
  it("crea un GuestUser nuevo cuando no se provee guestUserId", async () => {
    const result = await chatService.resolveGuestUser("Ada");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const stored = await guestUsers.findById(result.guestUserId);
      expect(stored?.displayName).toBe("Ada");
    }
  });

  it("reutiliza el GuestUser existente cuando el guestUserId es válido", async () => {
    const created = await guestUsers.create("Ada");
    const result = await chatService.resolveGuestUser("Ada2", created.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.guestUserId).toBe(created.id);
      const stored = await guestUsers.findById(created.id);
      expect(stored?.displayName).toBe("Ada2"); // se actualiza el nombre
    }
  });

  it("crea uno nuevo silenciosamente cuando el guestUserId no existe", async () => {
    const result = await chatService.resolveGuestUser("Ada", "id-inexistente");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.guestUserId).not.toBe("id-inexistente");
    }
  });
});

describe("ChatService.listRooms / findRoomBySlug", () => {
  it("lista las salas existentes, incluyendo la general sembrada", async () => {
    const list = await chatService.listRooms();
    expect(list.some((room) => room.slug === "general")).toBe(true);
  });

  it("retorna null para una sala inexistente", async () => {
    const room = await chatService.findRoomBySlug("no-existe");
    expect(room).toBeNull();
  });
});

describe("ChatService.createRoom", () => {
  it("crea una sala nueva con éxito", async () => {
    const result = await chatService.createRoom("Tecnología", "tecnologia");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.slug).toBe("tecnologia");
      expect(result.room.name).toBe("Tecnología");
    }
  });

  it("retorna SLUG_CONFLICT si el slug ya existe (autoridad final: el repositorio/DB)", async () => {
    await chatService.createRoom("Tecnología", "tecnologia");
    const second = await chatService.createRoom("Tecnología otra vez", "tecnologia");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("SLUG_CONFLICT");
  });
});

describe("ChatService.sendMessage", () => {
  it("persiste el mensaje en la sala correcta antes de retornarlo", async () => {
    const guest = await guestUsers.create("Ada");
    const result = await chatService.sendMessage({
      text: "hola",
      guestUserId: guest.id,
      roomId: generalRoomId,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.text).toBe("hola");
      expect(result.message.authorName).toBe("Ada");
      expect(result.message.roomId).toBe(generalRoomId);
    }
  });

  it("retorna fallo tipado si el repositorio lanza una excepción", async () => {
    const guest = await guestUsers.create("Ada");
    messages.failNextCreate = true;
    const result = await chatService.sendMessage({
      text: "hola",
      guestUserId: guest.id,
      roomId: generalRoomId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("PERSISTENCE_FAILED");
  });
});

describe("ChatService.getHistory", () => {
  it("retorna ROOM_NOT_FOUND para una sala inexistente", async () => {
    const result = await chatService.getHistory("sala-inexistente", 50);
    expect(result.ok).toBe(false);
  });

  it("pagina por cursor y retorna hasMore correctamente", async () => {
    const guest = await guestUsers.create("Ada");
    for (let i = 0; i < 5; i++) {
      await chatService.sendMessage({ text: `msg ${i}`, guestUserId: guest.id, roomId: generalRoomId });
    }

    const firstPage = await chatService.getHistory("general", 2);
    expect(firstPage.ok).toBe(true);
    if (firstPage.ok) {
      expect(firstPage.page.messages).toHaveLength(2);
      expect(firstPage.page.hasMore).toBe(true);
      expect(firstPage.page.nextCursor).not.toBeNull();
    }
  });

  it("aísla el historial por sala: mensajes de otra sala no aparecen", async () => {
    const guest = await guestUsers.create("Ada");
    const otherRoom = await chatService.createRoom("Tecnología", "tecnologia");
    if (!otherRoom.ok) throw new Error("setup failed");

    await chatService.sendMessage({ text: "en general", guestUserId: guest.id, roomId: generalRoomId });
    await chatService.sendMessage({ text: "en tecnologia", guestUserId: guest.id, roomId: otherRoom.room.id });

    const generalHistory = await chatService.getHistory("general", 50);
    const techHistory = await chatService.getHistory("tecnologia", 50);
    expect(generalHistory.ok && techHistory.ok).toBe(true);
    if (generalHistory.ok && techHistory.ok) {
      expect(generalHistory.page.messages.map((m) => m.text)).toEqual(["en general"]);
      expect(techHistory.page.messages.map((m) => m.text)).toEqual(["en tecnologia"]);
    }
  });
});
