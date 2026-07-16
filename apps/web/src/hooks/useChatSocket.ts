import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ChatMessage,
  ClientToServerEvents,
  PublicUser,
  ServerToClientEvents,
} from "@realtime-chat/shared";
import { getStoredGuestUserId, storeGuestUserId } from "../lib/guestIdentity";
import { fetchMessageHistory } from "../lib/messageHistory";

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000";
const ROOM_SLUG = "general";
const HISTORY_PAGE_SIZE = 50;

export interface UseChatSocketResult {
  connected: boolean;
  currentUser: PublicUser | null;
  users: PublicUser[];
  messages: ChatMessage[];
  joinError: string | null;
  sendError: string | null;
  historyLoading: boolean;
  historyError: string | null;
  hasMoreHistory: boolean;
  join: (name: string) => Promise<void>;
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
  const [connected, setConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const knownMessageIds = useRef(new Set<string>());

  useEffect(() => {
    const socket: ChatSocket = io(SOCKET_URL, { autoConnect: true });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("user:list", (payload) => setUsers(payload.users));
    socket.on("user:joined", () => {
      /* la lista completa llega por user:list; este evento es informativo */
    });
    socket.on("user:left", () => {
      /* idem */
    });
    socket.on("message:new", (message) => {
      if (knownMessageIds.current.has(message.id)) return;
      knownMessageIds.current.add(message.id);
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const loadInitialHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await fetchMessageHistory(ROOM_SLUG, { limit: HISTORY_PAGE_SIZE });
      for (const message of page.messages) knownMessageIds.current.add(message.id);
      setMessages((prev) => mergeMessagesById(prev, page.messages));
      nextCursorRef.current = page.nextCursor;
      setHasMoreHistory(page.hasMore);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo cargar el historial.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadMoreHistory = useCallback(async () => {
    if (!nextCursorRef.current || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await fetchMessageHistory(ROOM_SLUG, {
        limit: HISTORY_PAGE_SIZE,
        cursor: nextCursorRef.current,
      });
      for (const message of page.messages) knownMessageIds.current.add(message.id);
      setMessages((prev) => mergeMessagesById(prev, page.messages));
      nextCursorRef.current = page.nextCursor;
      setHasMoreHistory(page.hasMore);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo cargar el historial.");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyLoading]);

  const join = useCallback(
    (name: string) => {
      return new Promise<void>((resolve) => {
        const socket = socketRef.current;
        if (!socket) return resolve();
        setJoinError(null);
        const guestUserId = getStoredGuestUserId() ?? undefined;
        socket.emit("user:join", { name, guestUserId }, (ack) => {
          if (ack.ok) {
            setCurrentUser(ack.data.user);
            storeGuestUserId(ack.data.user.guestUserId);
            void loadInitialHistory();
          } else {
            setJoinError(ack.message);
          }
          resolve();
        });
      });
    },
    [loadInitialHistory]
  );

  const sendMessage = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      const socket = socketRef.current;
      if (!socket) return resolve();
      setSendError(null);
      socket.emit("message:send", { text }, (ack) => {
        if (!ack.ok) {
          setSendError(ack.message);
        }
        resolve();
      });
    });
  }, []);

  return {
    connected,
    currentUser,
    users,
    messages,
    joinError,
    sendError,
    historyLoading,
    historyError,
    hasMoreHistory,
    join,
    sendMessage,
    loadMoreHistory,
  };
}
