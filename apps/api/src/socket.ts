import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  type ChatMessage,
  type ClientToServerEvents,
  type PublicUser,
  type ServerToClientEvents,
  validateMessageText,
  validateName,
} from "@realtime-chat/shared";
import { RoomPresenceState } from "./presence/roomPresenceState.js";
import { SocketRateLimiter } from "./presence/rateLimiter.js";
import { ChatService } from "./services/chatService.js";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function createSocketServer(
  httpServer: HttpServer,
  corsOrigin: string,
  chatService: ChatService,
  presence: RoomPresenceState
): AppServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: corsOrigin },
  });

  const rateLimiter = new SocketRateLimiter();

  function broadcastRoomUsers(roomId: string): void {
    io.to(roomId).emit("room:users", { roomId, users: presence.listConsolidated(roomId) });
  }

  io.on("connection", (socket: AppSocket) => {
    socket.on("room:join", (payload, ack) => {
      const nameResult = validateName(payload?.name);
      if (!nameResult.valid) {
        ack(nameResult.error);
        return;
      }

      const roomSlug = payload?.roomSlug;
      if (typeof roomSlug !== "string" || roomSlug.length === 0) {
        ack({ ok: false, code: "ROOM_NOT_FOUND", message: "Sala no especificada." });
        return;
      }

      void (async () => {
        // 1. Validar que la sala destino existe ANTES de tocar la sala actual.
        const room = await chatService.findRoomBySlug(roomSlug);
        if (!room) {
          ack({ ok: false, code: "ROOM_NOT_FOUND", message: "La sala no existe." });
          return;
        }

        // 2. Resolver identidad invitada.
        const guestResult = await chatService.resolveGuestUser(nameResult.value, payload?.guestUserId);
        if (!guestResult.ok) {
          ack({
            ok: false,
            code: "MESSAGE_PERSISTENCE_FAILED",
            message: "No se pudo guardar tu identidad de invitado. Intenta de nuevo.",
          });
          return;
        }

        // 3. Solo ahora, con la sala destino validada, salir de la sala anterior (si había).
        const { previousRoomId } = presence.joinRoom(socket.id, room.id, guestResult.guestUserId, nameResult.value);
        socket.join(room.id);

        if (previousRoomId) {
          socket.leave(previousRoomId);
          if (presence.isGuestAbsentFromRoom(previousRoomId, guestResult.guestUserId)) {
            io.to(previousRoomId).emit("room:left", {
              roomId: previousRoomId,
              user: { id: guestResult.guestUserId, name: nameResult.value, guestUserId: guestResult.guestUserId },
            });
          }
          broadcastRoomUsers(previousRoomId);
        }

        // 4. Notificar a la nueva sala solo si este guest no estaba ya presente ahí por otro socket
        // (countSocketsForGuestInRoom incluye el socket recién unido, por eso > 1 significa "ya tenía otra pestaña aquí").
        const guestWasAlreadyInNewRoom = presence.countSocketsForGuestInRoom(room.id, guestResult.guestUserId) > 1;
        const user: PublicUser = { id: guestResult.guestUserId, name: nameResult.value, guestUserId: guestResult.guestUserId };
        if (!guestWasAlreadyInNewRoom) {
          socket.to(room.id).emit("room:joined", { roomId: room.id, user });
        }
        broadcastRoomUsers(room.id);

        ack({
          ok: true,
          data: {
            user,
            room: { id: room.id, name: room.name, slug: room.slug, createdAt: room.createdAt.getTime() },
            users: presence.listConsolidated(room.id),
          },
        });
      })();
    });

    socket.on("room:leave", (_payload, ack) => {
      const left = presence.leaveCurrentRoom(socket.id);
      if (!left) {
        ack({ ok: true, data: {} });
        return;
      }
      socket.leave(left.roomId);
      if (presence.isGuestAbsentFromRoom(left.roomId, left.guestUserId)) {
        io.to(left.roomId).emit("room:left", {
          roomId: left.roomId,
          user: { id: left.guestUserId, name: left.name, guestUserId: left.guestUserId },
        });
      }
      broadcastRoomUsers(left.roomId);
      ack({ ok: true, data: {} });
    });

    socket.on("message:send", (payload, ack) => {
      const roomId = presence.getCurrentRoomId(socket.id);
      if (!roomId) {
        ack({ ok: false, code: "NOT_JOINED", message: "Debes unirte a una sala antes de enviar mensajes." });
        return;
      }

      const result = validateMessageText(payload?.text);
      if (!result.valid) {
        ack(result.error);
        return;
      }

      const now = Date.now();
      if (!rateLimiter.registerAndCheck(socket.id, now)) {
        ack({
          ok: false,
          code: "RATE_LIMITED",
          message: "Estás enviando mensajes demasiado rápido.",
        });
        return;
      }

      void (async () => {
        // La sala y el autor se toman del estado del socket ya registrado
        // en el paso anterior, nunca de un roomId que pudiera venir en el
        // payload del cliente.
        const author = presence.getOwnPresence(socket.id);
        if (!author) {
          ack({ ok: false, code: "NOT_JOINED", message: "Debes unirte a una sala antes de enviar mensajes." });
          return;
        }

        const sendResult = await chatService.sendMessage({
          text: result.value,
          guestUserId: author.guestUserId,
          roomId,
        });

        if (!sendResult.ok) {
          ack({
            ok: false,
            code: "MESSAGE_PERSISTENCE_FAILED",
            message: "No se pudo guardar el mensaje. Intenta de nuevo.",
          });
          console.error("message persistence failed", {
            authorId: author.guestUserId,
            roomId,
            ts: now,
          });
          return;
        }

        const message: ChatMessage = sendResult.message;
        ack({ ok: true, data: { message } });
        io.to(roomId).emit("message:new", message);
      })();
    });

    socket.on("disconnect", () => {
      const left = presence.disconnect(socket.id);
      rateLimiter.clear(socket.id);
      if (!left) return;
      if (presence.isGuestAbsentFromRoom(left.roomId, left.guestUserId)) {
        io.to(left.roomId).emit("room:left", {
          roomId: left.roomId,
          user: { id: left.guestUserId, name: left.name, guestUserId: left.guestUserId },
        });
      }
      broadcastRoomUsers(left.roomId);
    });
  });

  return io;
}
