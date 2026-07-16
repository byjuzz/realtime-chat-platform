import { useCallback, useRef, useState } from "react";
import type { PublicRoom } from "@realtime-chat/shared";
import { createRoomRequest, fetchRooms, type CreateRoomError } from "../lib/rooms";

export interface UseRoomsResult {
  rooms: PublicRoom[];
  loadingRooms: boolean;
  roomsError: string | null;
  creatingRoom: boolean;
  createRoomError: string | null;
  refreshRooms: () => Promise<void>;
  createRoom: (name: string) => Promise<PublicRoom | null>;
}

/**
 * Lista de salas manejada únicamente por REST (Fase 4: sin room:created en
 * tiempo real). Se refresca explícitamente: al montar, tras crear una sala,
 * tras reconectar, y al abrir/recuperar foco el selector. Sin polling.
 */
export function useRooms(): UseRoomsResult {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshRooms = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingRooms(true);
    setRoomsError(null);
    try {
      const list = await fetchRooms(controller.signal);
      setRooms(list);
    } catch (error) {
      if (controller.signal.aborted) return;
      setRoomsError(error instanceof Error ? error.message : "No se pudo cargar la lista de salas.");
    } finally {
      if (!controller.signal.aborted) setLoadingRooms(false);
    }
  }, []);

  const createRoom = useCallback(async (name: string): Promise<PublicRoom | null> => {
    setCreatingRoom(true);
    setCreateRoomError(null);
    try {
      const room = await createRoomRequest(name);
      setRooms((prev) => [...prev, room]);
      return room;
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? (error as CreateRoomError).message
          : "No se pudo crear la sala.";
      setCreateRoomError(message);
      return null;
    } finally {
      setCreatingRoom(false);
    }
  }, []);

  return { rooms, loadingRooms, roomsError, creatingRoom, createRoomError, refreshRooms, createRoom };
}
