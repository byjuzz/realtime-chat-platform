import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageHistoryResponse, PublicRoom, RoomJoinAck } from "@realtime-chat/shared";

type Handler = (...args: unknown[]) => void;

const handlers = new Map<string, Handler[]>();
const managerHandlers = new Map<string, Handler[]>();
let lastJoinPayload: { name: string; guestUserId?: string; roomSlug: string } | undefined;

const rooms: Record<string, PublicRoom> = {
  general: { id: "room-general", name: "General", slug: "general", createdAt: 0, isPrivate: false, creatorId: null },
  tecnologia: { id: "room-tech", name: "Tecnología", slug: "tecnologia", createdAt: 1, isPrivate: false, creatorId: null },
};

const fakeSocket = {
  id: "socket-1",
  io: {
    on: (event: string, cb: Handler) => {
      const list = managerHandlers.get(event) ?? [];
      list.push(cb);
      managerHandlers.set(event, list);
    },
  },
  on: (event: string, cb: Handler) => {
    const list = handlers.get(event) ?? [];
    list.push(cb);
    handlers.set(event, list);
  },
  emit: (event: string, payload: unknown, ack?: (response: RoomJoinAck) => void) => {
    if (event === "room:join") {
      const p = payload as { name: string; guestUserId?: string; roomSlug: string };
      lastJoinPayload = p;
      const room = rooms[p.roomSlug];
      if (!room) {
        ack?.({ ok: false, code: "ROOM_NOT_FOUND", message: "La sala no existe." });
        return;
      }
      const guestUserId = p.guestUserId ?? "guest-abc";
      ack?.({
        ok: true,
        data: {
          user: { id: guestUserId, name: p.name, guestUserId },
          room,
          users: [{ id: guestUserId, name: p.name, guestUserId }],
        },
      });
    }
  },
  disconnect: vi.fn(),
};

function emitToHandlers(event: string, ...args: unknown[]) {
  for (const handler of handlers.get(event) ?? []) handler(...args);
}

function clearLastJoinPayload() {
  lastJoinPayload = undefined;
}

vi.mock("socket.io-client", () => ({
  io: () => fakeSocket,
}));

function historyResponse(roomSlug: string, messages: MessageHistoryResponse["messages"] = []): MessageHistoryResponse {
  return { room: { slug: roomSlug, name: rooms[roomSlug]?.name ?? roomSlug }, messages, hasMore: false, nextCursor: null };
}

const { useChatSocket } = await import("../useChatSocket");

describe("useChatSocket", () => {
  beforeEach(() => {
    handlers.clear();
    managerHandlers.clear();
    lastJoinPayload = undefined;
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const match = /\/api\/rooms\/([^/]+)\/messages/.exec(url);
        const slug = match?.[1] ?? "general";
        return { ok: true, json: async () => historyResponse(slug) } as Response;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("al unirse por primera vez, no envía guestUserId y guarda el que retorna el servidor", async () => {
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");

    await act(async () => {
      await result.current.join("Ada");
    });

    expect(lastJoinPayload?.guestUserId).toBeUndefined();
    expect(lastJoinPayload?.roomSlug).toBe("general");
    expect(localStorage.getItem("realtime-chat:guestUserId")).toBe("guest-abc");
    expect(localStorage.getItem("realtime-chat:activeRoomSlug")).toBe("general");
    expect(result.current.activeRoom?.slug).toBe("general");
  });

  it("reutiliza guestUserId y activeRoomSlug guardados en visitas posteriores", async () => {
    localStorage.setItem("realtime-chat:guestUserId", "guest-existente");
    localStorage.setItem("realtime-chat:activeRoomSlug", "tecnologia");
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");

    await act(async () => {
      await result.current.join("Ada");
    });

    expect(lastJoinPayload?.guestUserId).toBe("guest-existente");
    expect(lastJoinPayload?.roomSlug).toBe("tecnologia");
  });

  it("switchRoom cambia de sala, limpia mensajes anteriores y actualiza la sala activa", async () => {
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");
    await act(async () => {
      await result.current.join("Ada");
    });

    act(() => {
      emitToHandlers("message:new", {
        id: "m1",
        roomId: "room-general",
        authorId: "guest-abc",
        authorName: "Ada",
        text: "en general",
        ts: Date.now(),
      });
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    await act(async () => {
      await result.current.switchRoom("tecnologia");
    });

    expect(result.current.activeRoom?.slug).toBe("tecnologia");
    expect(result.current.messages).toHaveLength(0); // se limpiaron los mensajes de la sala anterior
  });

  it("switchRoom conserva la identidad de ESTA sesión aunque localStorage cambie externamente (otra pestaña)", async () => {
    // Regresión: localStorage es compartido por origen, no por pestaña. Si
    // otra pestaña (otro guestUserId) escribe ahí después del join inicial,
    // esta sesión no debe adoptar esa identidad ajena al cambiar de sala.
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");
    await act(async () => {
      await result.current.join("Ada"); // guarda guestUserId "guest-abc"
    });
    expect(localStorage.getItem("realtime-chat:guestUserId")).toBe("guest-abc");

    // Otra pestaña (otro usuario) sobreescribe el valor compartido.
    localStorage.setItem("realtime-chat:guestUserId", "guest-de-otra-pestana");

    await act(async () => {
      await result.current.switchRoom("tecnologia");
    });

    expect(lastJoinPayload?.guestUserId).toBe("guest-abc"); // no "guest-de-otra-pestana"
    expect(result.current.currentUser?.guestUserId).toBe("guest-abc");
  });

  it("ignora un message:new cuyo roomId no coincide con la sala activa", async () => {
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");
    await act(async () => {
      await result.current.join("Ada"); // sala activa: general (room-general)
    });

    act(() => {
      emitToHandlers("message:new", {
        id: "m-ajeno",
        roomId: "room-tech", // mensaje de otra sala
        authorId: "guest-abc",
        authorName: "Ada",
        text: "no debería aparecer",
        ts: Date.now(),
      });
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it("rechaza el cambio a una sala inexistente y conserva la sala activa anterior", async () => {
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");
    await act(async () => {
      await result.current.join("Ada");
    });

    await act(async () => {
      await result.current.switchRoom("no-existe");
    });

    expect(result.current.joinError).toBe("La sala no existe.");
    expect(result.current.activeRoom?.slug).toBe("general"); // rollback visual: no cambió
  });

  it("al reconectar, usa la sala activa de ESTA sesión aunque localStorage cambie externamente (otra pestaña)", async () => {
    // Regresión: activeRoomSlug también es compartido por origen. Si otra
    // pestaña cambia de sala mientras esta está desconectada, el reconnect
    // de esta sesión no debe seguir a esa otra pestaña.
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");
    await act(async () => {
      await result.current.join("Ada"); // sala activa: general
    });
    expect(localStorage.getItem("realtime-chat:activeRoomSlug")).toBe("general");

    // Otra pestaña cambia de sala; sobreescribe el valor compartido.
    localStorage.setItem("realtime-chat:activeRoomSlug", "tecnologia");

    clearLastJoinPayload();
    await act(async () => {
      for (const handler of managerHandlers.get("reconnect") ?? []) handler();
      await Promise.resolve();
    });

    const reconnectJoinPayload = lastJoinPayload;
    expect(reconnectJoinPayload?.roomSlug).toBe("general"); // no "tecnologia"
    expect(result.current.activeRoom?.slug).toBe("general");
  });

  it("no duplica un mensaje que llega por socket si ya estaba en el historial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          json: async () =>
            historyResponse("general", [
              { id: "m1", roomId: "room-general", authorId: "guest-abc", authorName: "Ada", text: "hola", ts: 1 },
            ]),
        }) as Response
      )
    );
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");
    await act(async () => {
      await result.current.join("Ada");
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => {
      emitToHandlers("message:new", {
        id: "m1",
        roomId: "room-general",
        authorId: "guest-abc",
        authorName: "Ada",
        text: "hola",
        ts: 1,
      });
    });

    expect(result.current.messages).toHaveLength(1);
  });

  it("al reconectar, vuelve a unirse a la sala activa guardada", async () => {
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");
    await act(async () => {
      await result.current.join("Ada");
    });

    clearLastJoinPayload();
    await act(async () => {
      for (const handler of managerHandlers.get("reconnect") ?? []) handler();
      await Promise.resolve();
    });

    const reconnectJoinPayload = lastJoinPayload;
    expect(reconnectJoinPayload?.roomSlug).toBe("general");
    expect(reconnectJoinPayload?.guestUserId).toBe("guest-abc");
  });
});
