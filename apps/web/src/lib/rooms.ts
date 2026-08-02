import type { CreateRoomResponse, PublicRoom, RoomListResponse } from "@realtime-chat/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface CreateRoomError {
  status: number;
  code: string;
  message: string;
}

export async function fetchRooms(signal?: AbortSignal): Promise<PublicRoom[]> {
  const response = await fetch(`${API_URL}/api/rooms`, { signal });
  if (!response.ok) {
    throw new Error(`No se pudo cargar la lista de salas (HTTP ${response.status})`);
  }
  const body = (await response.json()) as RoomListResponse;
  return body.rooms;
}

export async function createRoomRequest(name: string, isPrivate: boolean, guestUserId?: string): Promise<PublicRoom> {
  const response = await fetch(`${API_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, isPrivate, guestUserId }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    const error: CreateRoomError = {
      status: response.status,
      code: body.error ?? "UNKNOWN_ERROR",
      message: body.message ?? "No se pudo crear la sala.",
    };
    throw error;
  }

  const body = (await response.json()) as CreateRoomResponse;
  return body.room;
}
