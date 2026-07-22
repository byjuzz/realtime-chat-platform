import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ChatMessage,
  ClientToServerEvents,
  PublicRoom,
  PublicUser,
  RoomJoinAck,
  ServerToClientEvents,
} from "@realtime-chat/shared";
import { getStoredGuestUserId, storeGuestUserId } from "../lib/guestIdentity";
import { getStoredActiveRoomSlug, storeActiveRoomSlug } from "../lib/activeRoom";
import { fetchMessageHistory } from "../lib/messageHistory";

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000";
const HISTORY_PAGE_SIZE = 50;

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export interface UseChatSocketResult {
  connectionStatus: ConnectionStatus;
  currentUser: PublicUser | null;
  activeRoom: PublicRoom | null;
  users: PublicUser[];
  messages: ChatMessage[];
  joinError: string | null;
  sendError: string | null;
  historyLoading: boolean;
  historyError: string | null;
  hasMoreHistory: boolean;
  roomTransitioning: boolean;
  join: (name: string) => Promise<void>;
  switchRoom: (roomSlug: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  loadMoreHistory: () => Promise<void>;
}

function mergeMessagesById(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(existing.map((m) => m.id));
  const deduped = incoming.filter((m) => !seen.has(m.id));
  return [...deduped, ...existing];
}

export function useChatSocket(): UseChatSocketResult {
  const socketRef = useRef<ChatSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [activeRoom, setActiveRoom] = useState<PublicRoom | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [roomTransitioning, setRoomTransitioning] = useState(false);

  const activeRoomIdRef = useRef<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const knownMessageIds = useRef(new Set<string>());
  const transitionTokenRef = useRef(0);
  const historyAbortRef = useRef<AbortController | null>(null);
  const nameRef = useRef<string>("");
  // Identidad y sala activa ya resueltas para ESTA sesión de socket.
  // localStorage es compartido por todas las pestañas del mismo origen (no
  // por pestaña), así que una vez que esta sesión conoce su propio
  // guestUserId/sala activa, debe seguir usando esos valores en cambios de
  // sala y reconexiones posteriores, en vez de releer localStorage cada vez
  // (otra pestaña pudo haber escrito ahí mientras tanto). localStorage solo
  // se consulta para el primer join (restaurar sesión en una pestaña nueva).
  const guestUserIdRef = useRef<string | null>(null);
  const activeRoomSlugRef = useRef<string | null>(null);

  const loadInitialHistory = useCallback(async (roomSlug: string, token: number) => {
    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await fetchMessageHistory(roomSlug, {
        limit: HISTORY_PAGE_SIZE,
        signal: controller.signal,
      });
      if (token !== transitionTokenRef.current) return; // ya se cambió de sala de nuevo, respuesta obsoleta
      for (const message of page.messages) knownMessageIds.current.add(message.id);
      setMessages((prev) => mergeMessagesById(prev, page.messages));
      nextCursorRef.current = page.nextCursor;
      setHasMoreHistory(page.hasMore);
    } catch (error) {
      if (controller.signal.aborted) return; // cancelada intencionalmente, no es un error real
      if (token !== transitionTokenRef.current) return;
      setHistoryError(error instanceof Error ? error.message : "No se pudo cargar el historial.");
    } finally {
      if (token === transitionTokenRef.current) setHistoryLoading(false);
    }
  }, []);

  const performJoin = useCallback(
    async (name: string, roomSlug: string, isReconnect = false) => {
      const socket = socketRef.current;
      if (!socket) return;

      const myToken = ++transitionTokenRef.current;
      setRoomTransitioning(true);
      setJoinError(null);

      const guestUserId = guestUserIdRef.current ?? getStoredGuestUserId() ?? undefined;

      const realAck = await new Promise<RoomJoinAck>((resolve) => {
        socket.emit("room:join", { name, guestUserId, roomSlug }, resolve);
      });

      if (myToken !== transitionTokenRef.current) return; // una transición más nueva ya está en curso

      if (!realAck.ok) {
        setRoomTransitioning(false);
        if (isReconnect && realAck.code === "ROOM_NOT_FOUND" && roomSlug !== "general") {
          storeActiveRoomSlug("general");
          await performJoin(name, "general", true);
          return;
        }
        setJoinError(realAck.message);
        // Rollback visual: no se toca activeRoom/currentUser, la UI permanece
        // donde estaba (nunca se cambió optimistamente antes del ack).
        return;
      }

      guestUserIdRef.current = realAck.data.user.guestUserId;
      activeRoomSlugRef.current = realAck.data.room.slug;
      storeGuestUserId(realAck.data.user.guestUserId);
      storeActiveRoomSlug(realAck.data.room.slug);
      nameRef.current = name;

      activeRoomIdRef.current = realAck.data.room.id;
      setCurrentUser(realAck.data.user);
      setActiveRoom(realAck.data.room);
      setUsers(realAck.data.users);
      setMessages([]);
      knownMessageIds.current.clear();
      nextCursorRef.current = null;
      setHasMoreHistory(false);
      setSendError(null);
      // El socket ya está unido a la sala y recibiendo eventos en este punto;
      // no se espera al historial para desbloquear el envío de mensajes.
      setRoomTransitioning(false);

      void loadInitialHistory(realAck.data.room.slug, myToken);
    },
    [loadInitialHistory]
  );

  useEffect(() => {
    const socket: ChatSocket = io(SOCKET_URL, { autoConnect: true });
    socketRef.current = socket;

    socket.on("connect", () => setConnectionStatus("connected"));
    socket.on("disconnect", () => setConnectionStatus("reconnecting"));
    socket.io.on("reconnect_failed", () => setConnectionStatus("disconnected"));
    socket.io.on("reconnect", () => {
      const name = nameRef.current;
      if (!name) return;
      // Usa la sala activa de ESTA sesión (ref), no el valor compartido en
      // localStorage, que otra pestaña pudo haber sobreescrito mientras
      // este socket estaba desconectado.
      const roomSlug = activeRoomSlugRef.current ?? getStoredActiveRoomSlug();
      void performJoin(name, roomSlug, true);
    });

    socket.on("room:users", (payload) => {
      if (payload.roomId !== activeRoomIdRef.current) return;
      setUsers(payload.users);
    });
    socket.on("room:joined", () => {
      /* la lista completa llega por room:users; este evento es informativo */
    });
    socket.on("room:left", () => {
      /* idem */
    });
    socket.on("message:new", (message) => {
      if (message.roomId !== activeRoomIdRef.current) return; // ignora mensajes de una sala que ya no es la activa
      if (knownMessageIds.current.has(message.id)) return;
      knownMessageIds.current.add(message.id);
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [performJoin]);

  const join = useCallback(
    (name: string) => performJoin(name, getStoredActiveRoomSlug(), false),
    [performJoin]
  );

  const switchRoom = useCallback(
    (roomSlug: string) => {
      if (!nameRef.current) return Promise.resolve();
      if (activeRoom?.slug === roomSlug) return Promise.resolve();
      return performJoin(nameRef.current, roomSlug, false);
    },
    [performJoin, activeRoom]
  );

  const sendMessage = useCallback(
    (text: string) => {
      return new Promise<void>((resolve) => {
        const socket = socketRef.current;
        if (!socket || roomTransitioning) return resolve();
        setSendError(null);
        socket.emit("message:send", { text }, (ack) => {
          if (!ack.ok) {
            setSendError(ack.message);
          }
          resolve();
        });
      });
    },
    [roomTransitioning]
  );

  const loadMoreHistory = useCallback(async () => {
    if (!nextCursorRef.current || historyLoading || !activeRoom) return;
    const token = transitionTokenRef.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await fetchMessageHistory(activeRoom.slug, {
        limit: HISTORY_PAGE_SIZE,
        cursor: nextCursorRef.current,
      });
      if (token !== transitionTokenRef.current) return;
      for (const message of page.messages) knownMessageIds.current.add(message.id);
      setMessages((prev) => mergeMessagesById(prev, page.messages));
      nextCursorRef.current = page.nextCursor;
      setHasMoreHistory(page.hasMore);
    } catch (error) {
      if (token !== transitionTokenRef.current) return;
      setHistoryError(error instanceof Error ? error.message : "No se pudo cargar el historial.");
    } finally {
      if (token === transitionTokenRef.current) setHistoryLoading(false);
    }
  }, [historyLoading, activeRoom]);

  return {
    connectionStatus,
    currentUser,
    activeRoom,
    users,
    messages,
    joinError,
    sendError,
    historyLoading,
    historyError,
    hasMoreHistory,
    roomTransitioning,
    join,
    switchRoom,
    sendMessage,
    loadMoreHistory,
  };
}
