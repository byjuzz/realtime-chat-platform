import { Router } from "express";
import type { CreateRoomResponse, PublicRoom, RoomListResponse } from "@realtime-chat/shared";
import { RESERVED_ROOM_SLUGS, validateRoomName, slugifyRoomName } from "@realtime-chat/shared";
import type { ChatService } from "../services/chatService.js";
import type { RoomRecord } from "../repositories/roomRepository.js";
import type { RoomPresenceState } from "../presence/roomPresenceState.js";

const MAX_BODY_NAME_LENGTH = 200; // cota defensiva antes de validar longitud real

function toPublicRoom(room: RoomRecord, presence: RoomPresenceState): PublicRoom {
  return {
    id: room.id,
    name: room.name,
    slug: room.slug,
    createdAt: room.createdAt.getTime(),
    isPrivate: room.isPrivate,
    creatorId: room.creatorId,
    connectedUsers: presence.countConnectedGuests(room.id),
  };
}

export function createRoomRoutes(chatService: ChatService, presence: RoomPresenceState): Router {
  const router = Router();

  router.get("/rooms", async (_req, res) => {
    const rooms = await chatService.listRooms();
    const response: RoomListResponse = {
      rooms: rooms.map((room) => toPublicRoom(room, presence)),
    };
    res.json(response);
  });

  router.post("/rooms", async (req, res) => {
    const rawName: unknown = req.body?.name;
    if (typeof rawName === "string" && rawName.length > MAX_BODY_NAME_LENGTH) {
      res.status(400).json({ error: "INVALID_ROOM_NAME", message: "El nombre es demasiado largo." });
      return;
    }

    const nameResult = validateRoomName(rawName);
    if (!nameResult.valid) {
      res.status(400).json({ error: nameResult.error.code, message: nameResult.error.message });
      return;
    }

    const slug = slugifyRoomName(nameResult.value);
    if ((RESERVED_ROOM_SLUGS as readonly string[]).includes(slug)) {
      res.status(409).json({ error: "ROOM_SLUG_CONFLICT", message: "Ese nombre de sala no está disponible." });
      return;
    }

    const isPrivate = req.body?.isPrivate === true;
    const guestUserId: unknown = req.body?.guestUserId;
    if (isPrivate && typeof guestUserId !== "string") {
      res.status(400).json({
        error: "GUEST_IDENTITY_REQUIRED",
        message: "Debes ingresar a una sala antes de crear una sala privada.",
      });
      return;
    }

    const result = await chatService.createRoom(nameResult.value, slug, {
      isPrivate,
      creatorId: isPrivate ? (guestUserId as string) : null,
    });
    if (!result.ok) {
      if (result.reason === "SLUG_CONFLICT") {
        res.status(409).json({ error: "ROOM_SLUG_CONFLICT", message: "Ya existe una sala con ese nombre." });
        return;
      }
      res.status(500).json({ error: "MESSAGE_PERSISTENCE_FAILED", message: "No se pudo crear la sala." });
      return;
    }

    const response: CreateRoomResponse = { room: toPublicRoom(result.room, presence) };
    res.status(201).json(response);
  });

  router.get("/rooms/:slug", async (req, res) => {
    const room = await chatService.findRoomBySlug(req.params.slug);
    if (!room) {
      res.status(404).json({ error: "ROOM_NOT_FOUND" });
      return;
    }
    res.json({ room: toPublicRoom(room, presence) });
  });

  return router;
}
