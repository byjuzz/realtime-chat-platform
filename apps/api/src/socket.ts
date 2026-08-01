import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  VALIDATION,
  type ChatMessage,
  type ClientToServerEvents,
  type PublicUser,
  type RoomJoinAck,
  type ServerToClientEvents,
  validateName,
  validateOutgoingMessage,
} from "@realtime-chat/shared";
import { RoomPresenceState } from "./presence/roomPresenceState.js";
import { SocketRateLimiter } from "./presence/rateLimiter.js";
import { GuestSocketRegistry } from "./presence/guestSocketRegistry.js";
import { JoinRequestState } from "./presence/joinRequestState.js";
import { ChatService } from "./services/chatService.js";
import type { RoomRecord } from "./repositories/roomRepository.js";

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
  const guestSockets = new GuestSocketRegistry();
  const joinRequests = new JoinRequestState();

  function broadcastRoomUsers(roomId: string): void {
    io.to(roomId).emit("room:users", { roomId, users: presence.listConsolidated(roomId) });
  }

  /**
   * Completa la unión de `socket` a `room` (sala pública, o privada ya
   * aprobada) y devuelve el ack correspondiente. Se usa tanto para joins
   * directos como para joins que quedaron pendientes de aprobación.
   */
  function finalizeJoin(socket: AppSocket, room: RoomRecord, user: PublicUser): RoomJoinAck {
    const { previousRoomId } = presence.joinRoom(socket.id, room.id, user.guestUserId, user.name);
    socket.join(room.id);

    if (previousRoomId) {
      socket.leave(previousRoomId);
      if (presence.isGuestAbsentFromRoom(previousRoomId, user.guestUserId)) {
        io.to(previousRoomId).emit("room:left", { roomId: previousRoomId, user });
      }
      broadcastRoomUsers(previousRoomId);
    }

    // countSocketsForGuestInRoom incluye el socket recién unido, por eso > 1
    // significa "ya tenía otra pestaña aquí".
    const guestWasAlreadyInNewRoom = presence.countSocketsForGuestInRoom(room.id, user.guestUserId) > 1;
    if (!guestWasAlreadyInNewRoom) {
      socket.to(room.id).emit("room:joined", { roomId: room.id, user });
    }
    broadcastRoomUsers(room.id);

    return {
      ok: true,
      data: {
        user,
        room: {
          id: room.id,
          name: room.name,
          slug: room.slug,
          createdAt: room.createdAt.getTime(),
          isPrivate: room.isPrivate,
          creatorId: room.creatorId,
        },
        users: presence.listConsolidated(room.id),
      },
    };
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

        guestSockets.register(socket.id, guestResult.guestUserId);
        const user: PublicUser = { id: guestResult.guestUserId, name: nameResult.value, guestUserId: guestResult.guestUserId };

        // 3. Sala privada y quien pide entrar no es su creador: queda pendiente de aprobación.
        if (room.isPrivate && room.creatorId !== guestResult.guestUserId) {
          if (!room.creatorId) {
            ack({ ok: false, code: "JOIN_REJECTED", message: "Esta sala privada no tiene un creador válido." });
            return;
          }

          const request = joinRequests.create(
            {
              roomId: room.id,
              roomSlug: room.slug,
              creatorId: room.creatorId,
              requesterSocketId: socket.id,
              requester: user,
            },
            VALIDATION.JOIN_REQUEST_TTL_MS,
            (expired) => {
              const requesterSocket = io.sockets.sockets.get(expired.requesterSocketId);
              requesterSocket?.emit("room:join-resolved", {
                ok: false,
                code: "JOIN_EXPIRED",
                message: "Nadie aprobó tu solicitud a tiempo.",
              });
            }
          );

          ack({
            ok: false,
            code: "JOIN_PENDING_APPROVAL",
            message: "Esperando aprobación del creador de la sala.",
          });

          for (const creatorSocketId of guestSockets.getSocketIds(room.creatorId)) {
            io.to(creatorSocketId).emit("room:join-request", {
              requestId: request.requestId,
              roomId: room.id,
              requester: user,
              expiresAt: request.expiresAt,
            });
          }
          return;
        }

        // 4. Sala pública, o privada y quien pide entrar es su propio creador: join directo.
        ack(finalizeJoin(socket, room, user));
      })();
    });

    socket.on("room:approve", (payload, ack) => {
      const requestId = payload?.requestId;
      const guestUserId = payload?.guestUserId;
      if (typeof requestId !== "string" || typeof guestUserId !== "string") {
        ack({ ok: false, code: "JOIN_REQUEST_NOT_FOUND", message: "Solicitud inválida." });
        return;
      }

      const pending = joinRequests.get(requestId);
      if (!pending) {
        ack({ ok: false, code: "JOIN_REQUEST_NOT_FOUND", message: "La solicitud ya no existe (pudo expirar)." });
        return;
      }
      if (pending.creatorId !== guestUserId) {
        ack({ ok: false, code: "NOT_ROOM_CREATOR", message: "Solo el creador de la sala puede aprobar solicitudes." });
        return;
      }

      joinRequests.resolve(requestId);
      ack({ ok: true, data: {} });

      void (async () => {
        const room = await chatService.findRoomBySlug(pending.roomSlug);
        const requesterSocket = io.sockets.sockets.get(pending.requesterSocketId);
        if (!room || !requesterSocket) return; // el solicitante se desconectó, o la sala ya no existe
        requesterSocket.emit("room:join-resolved", finalizeJoin(requesterSocket, room, pending.requester));
      })();
    });

    socket.on("room:reject", (payload, ack) => {
      const requestId = payload?.requestId;
      const guestUserId = payload?.guestUserId;
      if (typeof requestId !== "string" || typeof guestUserId !== "string") {
        ack({ ok: false, code: "JOIN_REQUEST_NOT_FOUND", message: "Solicitud inválida." });
        return;
      }

      const pending = joinRequests.get(requestId);
      if (!pending) {
        ack({ ok: false, code: "JOIN_REQUEST_NOT_FOUND", message: "La solicitud ya no existe (pudo expirar)." });
        return;
      }
      if (pending.creatorId !== guestUserId) {
        ack({ ok: false, code: "NOT_ROOM_CREATOR", message: "Solo el creador de la sala puede rechazar solicitudes." });
        return;
      }

      joinRequests.resolve(requestId);
      ack({ ok: true, data: {} });

      const requesterSocket = io.sockets.sockets.get(pending.requesterSocketId);
      requesterSocket?.emit("room:join-resolved", {
        ok: false,
        code: "JOIN_REJECTED",
        message: "El creador de la sala rechazó tu solicitud.",
      });
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

      const result = validateOutgoingMessage(payload?.text, payload?.imageData);
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
          text: result.value.text,
          imageData: result.value.imageData,
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
      joinRequests.deleteByRequesterSocket(socket.id);
      guestSockets.unregister(socket.id);

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
