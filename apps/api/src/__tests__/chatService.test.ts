import { beforeEach, describe, expect, it } from "vitest";
import { ChatService } from "../services/chatService.js";
import { FakeGuestUserRepository, FakeMessageRepository, FakeRoomRepository } from "./fakes.js";

let guestUsers: FakeGuestUserRepository;
let rooms: FakeRoomRepository;
let messages: FakeMessageRepository;
let chatService: ChatService;

beforeEach(() => {
  guestUsers = new FakeGuestUserRepository();
  rooms = new FakeRoomRepository();
  messages = new FakeMessageRepository(guestUsers);
  chatService = new ChatService(guestUsers, rooms, messages);
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

describe("ChatService.sendMessage", () => {
  it("persiste el mensaje antes de retornarlo", async () => {
    const guest = await guestUsers.create("Ada");
    const result = await chatService.sendMessage({
      text: "hola",
      guestUserId: guest.id,
      roomSlug: "general",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.text).toBe("hola");
      expect(result.message.authorName).toBe("Ada");
    }
  });

  it("retorna fallo tipado si el repositorio lanza una excepción", async () => {
    const guest = await guestUsers.create("Ada");
    messages.failNextCreate = true;
    const result = await chatService.sendMessage({
      text: "hola",
      guestUserId: guest.id,
      roomSlug: "general",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("PERSISTENCE_FAILED");
  });

  it("retorna fallo tipado si la sala no existe", async () => {
    const guest = await guestUsers.create("Ada");
    const result = await chatService.sendMessage({
      text: "hola",
      guestUserId: guest.id,
      roomSlug: "sala-inexistente",
    });
    expect(result.ok).toBe(false);
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
      await chatService.sendMessage({ text: `msg ${i}`, guestUserId: guest.id, roomSlug: "general" });
    }

    const firstPage = await chatService.getHistory("general", 2);
    expect(firstPage.ok).toBe(true);
    if (firstPage.ok) {
      expect(firstPage.page.messages).toHaveLength(2);
      expect(firstPage.page.hasMore).toBe(true);
      expect(firstPage.page.nextCursor).not.toBeNull();
    }
  });

  it("retorna los mensajes en orden cronológico ascendente", async () => {
    const guest = await guestUsers.create("Ada");
    await chatService.sendMessage({ text: "primero", guestUserId: guest.id, roomSlug: "general" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await chatService.sendMessage({ text: "segundo", guestUserId: guest.id, roomSlug: "general" });

    const result = await chatService.getHistory("general", 50);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.page.messages.map((m) => m.text)).toEqual(["primero", "segundo"]);
    }
  });
});
