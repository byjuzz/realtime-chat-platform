import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JoinAck, MessageHistoryResponse } from "@realtime-chat/shared";

type Handler = (...args: unknown[]) => void;

const handlers = new Map<string, Handler[]>();
let lastJoinPayload: { name: string; guestUserId?: string } | undefined;

const fakeSocket = {
  id: "socket-1",
  on: (event: string, cb: Handler) => {
    const list = handlers.get(event) ?? [];
    list.push(cb);
    handlers.set(event, list);
  },
  emit: (event: string, payload: unknown, ack?: (response: JoinAck) => void) => {
    if (event === "user:join") {
      lastJoinPayload = payload as { name: string; guestUserId?: string };
      ack?.({
        ok: true,
        data: { user: { id: "socket-1", name: (payload as { name: string }).name, guestUserId: "guest-abc" } },
      });
    }
  },
  disconnect: vi.fn(),
};

function emitToHandlers(event: string, ...args: unknown[]) {
  for (const handler of handlers.get(event) ?? []) handler(...args);
}

vi.mock("socket.io-client", () => ({
  io: () => fakeSocket,
}));

const { useChatSocket } = await import("../useChatSocket");

describe("useChatSocket", () => {
  beforeEach(() => {
    handlers.clear();
    lastJoinPayload = undefined;
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const body: MessageHistoryResponse = {
          room: { slug: "general", name: "General" },
          messages: [
            { id: "m1", authorId: "guest-abc", authorName: "Ada", text: "hola", ts: Date.now() },
          ],
          hasMore: false,
          nextCursor: null,
        };
        return { ok: true, json: async () => body } as Response;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("al unirse, guarda el guestUserId y carga el historial inicial", async () => {
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");

    await act(async () => {
      await result.current.join("Ada");
    });

    expect(lastJoinPayload?.guestUserId).toBeUndefined(); // primera visita: sin id previo
    expect(localStorage.getItem("realtime-chat:guestUserId")).toBe("guest-abc");

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });
    expect(result.current.messages[0]?.text).toBe("hola");
  });

  it("reutiliza el guestUserId guardado en visitas posteriores", async () => {
    localStorage.setItem("realtime-chat:guestUserId", "guest-existente");
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");

    await act(async () => {
      await result.current.join("Ada");
    });

    expect(lastJoinPayload?.guestUserId).toBe("guest-existente");
  });

  it("no duplica un mensaje que llega por socket si ya estaba en el historial", async () => {
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");

    await act(async () => {
      await result.current.join("Ada");
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => {
      emitToHandlers("message:new", {
        id: "m1", // mismo id que ya vino en el historial
        authorId: "guest-abc",
        authorName: "Ada",
        text: "hola",
        ts: Date.now(),
      });
    });

    expect(result.current.messages).toHaveLength(1);
  });

  it("agrega un mensaje nuevo de Socket.IO después del historial", async () => {
    const { result } = renderHook(() => useChatSocket());
    emitToHandlers("connect");

    await act(async () => {
      await result.current.join("Ada");
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => {
      emitToHandlers("message:new", {
        id: "m2",
        authorId: "guest-abc",
        authorName: "Ada",
        text: "segundo mensaje",
        ts: Date.now(),
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]?.text).toBe("segundo mensaje");
  });
});
