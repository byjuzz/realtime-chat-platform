import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  type ChatMessage,
  type ClientToServerEvents,
  type ServerToClientEvents,
  validateMessageText,
  validateName,
} from "@realtime-chat/shared";
import { RoomState } from "./roomState.js";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function createSocketServer(httpServer: HttpServer, corsOrigin: string): AppServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: corsOrigin },
  });

  const room = new RoomState();

  io.on("connection", (socket: AppSocket) => {
    socket.on("user:join", (payload, ack) => {
      if (room.hasJoined(socket.id)) {
        ack({ ok: false, code: "ALREADY_JOINED", message: "Ya te uniste a la sala." });
        return;
      }

      const result = validateName(payload?.name);
      if (!result.valid) {
        ack(result.error);
        return;
      }

      const user = room.join(socket.id, result.value);
      ack({ ok: true, data: { user } });

      socket.broadcast.emit("user:joined", user);
      io.emit("user:list", { users: room.listUsers() });
    });

    socket.on("message:send", (payload, ack) => {
      const author = room.getUser(socket.id);
      if (!author) {
        ack({ ok: false, code: "NOT_JOINED", message: "Debes unirte antes de enviar mensajes." });
        return;
      }

      const result = validateMessageText(payload?.text);
      if (!result.valid) {
        ack(result.error);
        return;
      }

      const now = Date.now();
      if (!room.registerMessageAndCheckRateLimit(socket.id, now)) {
        ack({
          ok: false,
          code: "RATE_LIMITED",
          message: "Estás enviando mensajes demasiado rápido.",
        });
        return;
      }

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        authorId: author.id,
        authorName: author.name,
        text: result.value,
        ts: now,
      };

      ack({ ok: true, data: { message } });
      io.emit("message:new", message);
    });

    socket.on("disconnect", () => {
      const user = room.leave(socket.id);
      if (user) {
        io.emit("user:left", user);
        io.emit("user:list", { users: room.listUsers() });
      }
    });
  });

  return io;
}
