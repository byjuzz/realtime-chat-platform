import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ChatMessage,
  ClientToServerEvents,
  PublicUser,
  ServerToClientEvents,
} from "@realtime-chat/shared";

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000";

export interface UseChatSocketResult {
  connected: boolean;
  currentUser: PublicUser | null;
  users: PublicUser[];
  messages: ChatMessage[];
  joinError: string | null;
  sendError: string | null;
  join: (name: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
}

export function useChatSocket(): UseChatSocketResult {
  const socketRef = useRef<ChatSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

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
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const join = useCallback((name: string) => {
    return new Promise<void>((resolve) => {
      const socket = socketRef.current;
      if (!socket) return resolve();
      setJoinError(null);
      socket.emit("user:join", { name }, (ack) => {
        if (ack.ok) {
          setCurrentUser(ack.data.user);
        } else {
          setJoinError(ack.message);
        }
        resolve();
      });
    });
  }, []);

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

  return { connected, currentUser, users, messages, joinError, sendError, join, sendMessage };
}
