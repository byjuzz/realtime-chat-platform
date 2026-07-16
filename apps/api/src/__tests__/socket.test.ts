import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  ChatMessage,
  ClientToServerEvents,
  JoinAck,
  MessageAck,
  PublicUser,
  ServerToClientEvents,
} from "@realtime-chat/shared";
import { VALIDATION } from "@realtime-chat/shared";
import { createSocketServer } from "../socket.js";
import { ChatService } from "../services/chatService.js";
import { FakeGuestUserRepository, FakeMessageRepository, FakeRoomRepository } from "./fakes.js";

type AppClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let httpServer: HttpServer;
let baseUrl: string;
let messageRepository: FakeMessageRepository;

beforeEach(async () => {
  httpServer = createServer();
  const guestUsers = new FakeGuestUserRepository();
  const rooms = new FakeRoomRepository();
  messageRepository = new FakeMessageRepository(guestUsers);
  const chatService = new ChatService(guestUsers, rooms, messageRepository);
  createSocketServer(httpServer, "http://localhost:5173", chatService);
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

function join(socket: AppClientSocket, name: string): Promise<JoinAck> {
  return new Promise((resolve) => socket.emit("user:join", { name }, resolve));
}

function sendMessage(socket: AppClientSocket, text: string): Promise<MessageAck> {
  return new Promise((resolve) => socket.emit("message:send", { text }, resolve));
}

describe("socket server", () => {
  it("permite que dos clientes se conecten simultáneamente", async () => {
    const a = await connectClient();
    const b = await connectClient();
    expect(a.connected).toBe(true);
    expect(b.connected).toBe(true);
    a.close();
    b.close();
  });

  it("acepta un join válido y devuelve el usuario público", async () => {
    const a = await connectClient();
    const ack = await join(a, "Ada");
    expect(ack.ok).toBe(true);
    if (ack.ok) {
      expect(ack.data.user.name).toBe("Ada");
      expect(ack.data.user.id).toBe(a.id);
    }
    a.close();
  });

  it("rechaza un join inválido (nombre vacío)", async () => {
    const a = await connectClient();
    const ack = await join(a, "   ");
    expect(ack.ok).toBe(false);
    if (!ack.ok) {
      expect(ack.code).toBe("INVALID_NAME");
    }
    a.close();
  });

  it("rechaza un segundo join del mismo socket", async () => {
    const a = await connectClient();
    await join(a, "Ada");
    const second = await join(a, "Ada2");
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe("ALREADY_JOINED");
    }
    a.close();
  });

  it("emite user:list actualizado a todos cuando alguien entra", async () => {
    const a = await connectClient();
    const b = await connectClient();

    const listWithGrace = new Promise<{ users: PublicUser[] }>((resolve) => {
      a.on("user:list", (payload) => {
        if (payload.users.some((u) => u.name === "Grace")) resolve(payload);
      });
    });

    await join(a, "Ada");
    await join(b, "Grace");

    const list = await listWithGrace;
    expect(list.users.some((u) => u.name === "Grace")).toBe(true);
    expect(list.users.some((u) => u.name === "Ada")).toBe(true);

    a.close();
    b.close();
  });

  it("hace broadcast de un mensaje a todos los clientes conectados", async () => {
    const a = await connectClient();
    const b = await connectClient();
    await join(a, "Ada");
    await join(b, "Grace");

    const receivedByB = new Promise<ChatMessage>((resolve) => b.on("message:new", resolve));

    const ack = await sendMessage(a, "hola grace");
    expect(ack.ok).toBe(true);

    const message = await receivedByB;
    expect(message.text).toBe("hola grace");
    expect(message.authorName).toBe("Ada");

    a.close();
    b.close();
  });

  it("rechaza un mensaje vacío", async () => {
    const a = await connectClient();
    await join(a, "Ada");
    const ack = await sendMessage(a, "   ");
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe("EMPTY_MESSAGE");
    a.close();
  });

  it("rechaza un mensaje demasiado largo", async () => {
    const a = await connectClient();
    await join(a, "Ada");
    const tooLong = "x".repeat(VALIDATION.MESSAGE_MAX_LENGTH + 1);
    const ack = await sendMessage(a, tooLong);
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe("MESSAGE_TOO_LONG");
    a.close();
  });

  it("rechaza el envío de mensajes antes del join", async () => {
    const a = await connectClient();
    const ack = await sendMessage(a, "hola");
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe("NOT_JOINED");
    a.close();
  });

  it("no emite message:new si la persistencia falla, y responde ack de error", async () => {
    const a = await connectClient();
    const b = await connectClient();
    await join(a, "Ada");
    await join(b, "Grace");

    let received = false;
    b.on("message:new", () => {
      received = true;
    });

    messageRepository.failNextCreate = true;
    const ack = await sendMessage(a, "este mensaje no debe persistirse");

    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe("MESSAGE_PERSISTENCE_FAILED");

    // damos un tick para asegurarnos de que, si se emitiera, ya habría llegado
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toBe(false);

    a.close();
    b.close();
  });

  it("limpia el usuario y notifica user:left tras la desconexión", async () => {
    const a = await connectClient();
    const b = await connectClient();
    await join(a, "Ada");
    await join(b, "Grace");

    const leftPromise = new Promise<PublicUser>((resolve) => b.on("user:left", resolve));
    const listAfterLeave = new Promise<{ users: PublicUser[] }>((resolve) => {
      b.on("user:list", (payload) => {
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
});
