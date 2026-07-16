import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  ChatMessage,
  ClientToServerEvents,
  MessageAck,
  PublicUser,
  RoomJoinAck,
  RoomUsersPayload,
  ServerToClientEvents,
} from "@realtime-chat/shared";
import { VALIDATION } from "@realtime-chat/shared";
import { createSocketServer } from "../socket.js";
import { ChatService } from "../services/chatService.js";
import { RoomPresenceState } from "../presence/roomPresenceState.js";
import { FakeGuestUserRepository, FakeMessageRepository, FakeRoomRepository } from "./fakes.js";

type AppClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let httpServer: HttpServer;
let baseUrl: string;
let messageRepository: FakeMessageRepository;
let roomRepository: FakeRoomRepository;

beforeEach(async () => {
  httpServer = createServer();
  const guestUsers = new FakeGuestUserRepository();
  roomRepository = new FakeRoomRepository();
  messageRepository = new FakeMessageRepository(guestUsers);
  const chatService = new ChatService(guestUsers, roomRepository, messageRepository);
  const presence = new RoomPresenceState();
  createSocketServer(httpServer, "http://localhost:5173", chatService, presence);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connectClient(): Promise<AppClientSocket> {
  return new Promise((resolve, reject) => {
    const socket: AppClientSocket = ioClient(baseUrl, { forceNew: true, transports: ["websocket"] });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

function joinRoom(
  socket: AppClientSocket,
  name: string,
  roomSlug: string,
  guestUserId?: string
): Promise<RoomJoinAck> {
  return new Promise((resolve) => socket.emit("room:join", { name, roomSlug, guestUserId }, resolve));
}

function sendMessage(socket: AppClientSocket, text: string): Promise<MessageAck> {
  return new Promise((resolve) => socket.emit("message:send", { text }, resolve));
}

describe("socket server - unión y presencia por sala", () => {
  it("permite que dos clientes se conecten simultáneamente", async () => {
    const a = await connectClient();
    const b = await connectClient();
    expect(a.connected).toBe(true);
    expect(b.connected).toBe(true);
    a.close();
    b.close();
  });

  it("acepta room:join a la sala general y devuelve usuario, sala y presencia", async () => {
    const a = await connectClient();
    const ack = await joinRoom(a, "Ada", "general");
    expect(ack.ok).toBe(true);
    if (ack.ok) {
      expect(ack.data.user.name).toBe("Ada");
      expect(ack.data.room.slug).toBe("general");
      expect(ack.data.users.some((u) => u.name === "Ada")).toBe(true);
    }
    a.close();
  });

  it("rechaza room:join a una sala inexistente", async () => {
    const a = await connectClient();
    const ack = await joinRoom(a, "Ada", "no-existe");
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe("ROOM_NOT_FOUND");
    a.close();
  });

  it("rechaza un nombre inválido", async () => {
    const a = await connectClient();
    const ack = await joinRoom(a, "  ", "general");
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe("INVALID_NAME");
    a.close();
  });

  it("emite room:users actualizado a la sala cuando alguien entra", async () => {
    const a = await connectClient();
    const b = await connectClient();
    await joinRoom(a, "Ada", "general");

    const usersWithGrace = new Promise<RoomUsersPayload>((resolve) => {
      a.on("room:users", (payload) => {
        if (payload.users.some((u) => u.name === "Grace")) resolve(payload);
      });
    });

    await joinRoom(b, "Grace", "general");

    const payload = await usersWithGrace;
    expect(payload.users.some((u) => u.name === "Grace")).toBe(true);
    expect(payload.users.some((u) => u.name === "Ada")).toBe(true);

    a.close();
    b.close();
  });

  it("consolida por guestUserId: dos sockets del mismo invitado cuentan como una sola presencia", async () => {
    const a = await connectClient();
    const ackA = await joinRoom(a, "Ada", "general");
    expect(ackA.ok).toBe(true);
    const guestUserId = ackA.ok ? ackA.data.user.guestUserId : undefined;

    const b = await connectClient();
    const ackB = await joinRoom(b, "Ada", "general", guestUserId);
    expect(ackB.ok).toBe(true);
    if (ackB.ok) {
      const adaEntries = ackB.data.users.filter((u) => u.guestUserId === guestUserId);
      expect(adaEntries).toHaveLength(1);
    }

    a.close();
    b.close();
  });
});

describe("socket server - aislamiento entre salas", () => {
  it("usuarios en salas distintas no reciben mensajes ajenos", async () => {
    await roomRepository.create({ name: "Tecnología", slug: "tecnologia" });

    const a = await connectClient(); // general
    const b = await connectClient(); // tecnologia
    await joinRoom(a, "Ada", "general");
    await joinRoom(b, "Grace", "tecnologia");

    let bReceived: ChatMessage | undefined;
    b.on("message:new", (message) => {
      bReceived = message;
    });

    const ack = await sendMessage(a, "solo para general");
    expect(ack.ok).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bReceived).toBeUndefined();

    a.close();
    b.close();
  });

  it("dos usuarios en la misma sala sí reciben los mensajes del otro", async () => {
    const a = await connectClient();
    const b = await connectClient();
    await joinRoom(a, "Ada", "general");
    await joinRoom(b, "Grace", "general");

    const received = new Promise<ChatMessage>((resolve) => b.on("message:new", resolve));
    const ack = await sendMessage(a, "hola grace");
    expect(ack.ok).toBe(true);

    const message = await received;
    expect(message.text).toBe("hola grace");
    expect(message.authorName).toBe("Ada");

    a.close();
    b.close();
  });
});

describe("socket server - cambio de sala", () => {
  it("cambiar de sala actualiza la presencia en la sala anterior y en la nueva", async () => {
    await roomRepository.create({ name: "Tecnología", slug: "tecnologia" });

    const a = await connectClient();
    const observer = await connectClient();
    await joinRoom(a, "Ada", "general");
    await joinRoom(observer, "Observer", "general");

    const generalUsersAfterLeave = new Promise<RoomUsersPayload>((resolve) => {
      observer.on("room:users", (payload) => {
        if (!payload.users.some((u) => u.name === "Ada")) resolve(payload);
      });
    });

    const ackSwitch = await joinRoom(a, "Ada", "tecnologia");
    expect(ackSwitch.ok).toBe(true);
    if (ackSwitch.ok) expect(ackSwitch.data.room.slug).toBe("tecnologia");

    const afterLeave = await generalUsersAfterLeave;
    expect(afterLeave.users.some((u) => u.name === "Ada")).toBe(false);

    a.close();
    observer.close();
  });

  it("un mensaje enviado tras cambiar de sala llega a la nueva sala, no a la anterior", async () => {
    await roomRepository.create({ name: "Tecnología", slug: "tecnologia" });

    const a = await connectClient();
    const inGeneral = await connectClient();
    const inTech = await connectClient();
    await joinRoom(a, "Ada", "general");
    await joinRoom(inGeneral, "Observer1", "general");
    await joinRoom(inTech, "Observer2", "tecnologia");

    await joinRoom(a, "Ada", "tecnologia");

    let generalReceived = false;
    inGeneral.on("message:new", () => {
      generalReceived = true;
    });
    const techReceived = new Promise<ChatMessage>((resolve) => inTech.on("message:new", resolve));

    await sendMessage(a, "ya estoy en tecnologia");
    const message = await techReceived;
    expect(message.text).toBe("ya estoy en tecnologia");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(generalReceived).toBe(false);

    a.close();
    inGeneral.close();
    inTech.close();
  });
});

describe("socket server - envío de mensajes", () => {
  it("rechaza un mensaje vacío", async () => {
    const a = await connectClient();
    await joinRoom(a, "Ada", "general");
    const ack = await sendMessage(a, "   ");
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe("EMPTY_MESSAGE");
    a.close();
  });

  it("rechaza un mensaje demasiado largo", async () => {
    const a = await connectClient();
    await joinRoom(a, "Ada", "general");
    const tooLong = "x".repeat(VALIDATION.MESSAGE_MAX_LENGTH + 1);
    const ack = await sendMessage(a, tooLong);
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe("MESSAGE_TOO_LONG");
    a.close();
  });

  it("rechaza el envío de mensajes antes de unirse a una sala", async () => {
    const a = await connectClient();
    const ack = await sendMessage(a, "hola");
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe("NOT_JOINED");
    a.close();
  });

  it("no emite message:new si la persistencia falla, y responde ack de error", async () => {
    const a = await connectClient();
    const b = await connectClient();
    await joinRoom(a, "Ada", "general");
    await joinRoom(b, "Grace", "general");

    let received = false;
    b.on("message:new", () => {
      received = true;
    });

    messageRepository.failNextCreate = true;
    const ack = await sendMessage(a, "este mensaje no debe persistirse");

    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe("MESSAGE_PERSISTENCE_FAILED");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toBe(false);

    a.close();
    b.close();
  });
});

describe("socket server - desconexión", () => {
  it("limpia el usuario y notifica room:left tras la desconexión", async () => {
    const a = await connectClient();
    const b = await connectClient();
    await joinRoom(a, "Ada", "general");
    await joinRoom(b, "Grace", "general");

    const leftPromise = new Promise<PublicUser>((resolve) => b.on("room:left", (payload) => resolve(payload.user)));
    const listAfterLeave = new Promise<RoomUsersPayload>((resolve) => {
      b.on("room:users", (payload) => {
        if (!payload.users.some((u) => u.name === "Ada")) resolve(payload);
      });
    });

    a.close();

    const left = await leftPromise;
    expect(left.name).toBe("Ada");

    const list = await listAfterLeave;
    expect(list.users.some((u) => u.name === "Ada")).toBe(false);

    b.close();
  });

  it("no emite room:left si el mismo guestUserId sigue presente en otra pestaña", async () => {
    const a = await connectClient();
    const aSecondTab = await connectClient();
    const observer = await connectClient();

    const ackA = await joinRoom(a, "Ada", "general");
    const guestUserId = ackA.ok ? ackA.data.user.guestUserId : undefined;
    await joinRoom(aSecondTab, "Ada", "general", guestUserId);
    await joinRoom(observer, "Observer", "general");

    let leftEmitted = false;
    observer.on("room:left", () => {
      leftEmitted = true;
    });

    a.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(leftEmitted).toBe(false);

    aSecondTab.close();
    observer.close();
  });
});
