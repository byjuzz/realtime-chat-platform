import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicRoom } from "@realtime-chat/shared";
import type { UseChatSocketResult } from "../hooks/useChatSocket";
import type { UseRoomsResult } from "../hooks/useRooms";

const generalRoom: PublicRoom = { id: "room-1", name: "General", slug: "general", createdAt: 0 };

const chatSocketState: { value: UseChatSocketResult } = {
  value: {
    connectionStatus: "connected",
    currentUser: null,
    activeRoom: null,
    users: [],
    messages: [],
    joinError: null,
    sendError: null,
    historyLoading: false,
    historyError: null,
    hasMoreHistory: false,
    roomTransitioning: false,
    join: vi.fn(),
    switchRoom: vi.fn(),
    sendMessage: vi.fn(),
    loadMoreHistory: vi.fn(),
  },
};

const roomsState: { value: UseRoomsResult } = {
  value: {
    rooms: [generalRoom],
    loadingRooms: false,
    roomsError: null,
    creatingRoom: false,
    createRoomError: null,
    refreshRooms: vi.fn(async () => {}),
    createRoom: vi.fn(async () => null),
  },
};

vi.mock("../hooks/useChatSocket", () => ({
  useChatSocket: () => chatSocketState.value,
}));

vi.mock("../hooks/useRooms", () => ({
  useRooms: () => roomsState.value,
}));

const { default: App } = await import("../App");

describe("App - transición de ingreso a chat", () => {
  it("muestra JoinForm cuando no hay usuario actual", () => {
    chatSocketState.value = { ...chatSocketState.value, currentUser: null, activeRoom: null };
    render(<App />);
    expect(screen.getByRole("form", { name: "Unirse al chat" })).toBeInTheDocument();
  });

  it("muestra ChatRoom cuando ya existe un usuario actual y una sala activa", () => {
    chatSocketState.value = {
      ...chatSocketState.value,
      currentUser: { id: "guest-1", name: "Ada", guestUserId: "guest-1" },
      activeRoom: generalRoom,
    };
    render(<App />);
    expect(screen.getByRole("region", { name: "Sala de chat" })).toBeInTheDocument();
  });

  it("muestra el selector de salas con la sala general", () => {
    render(<App />);
    const selector = screen.getByRole("navigation", { name: "Selector de salas" });
    expect(selector).toBeInTheDocument();
    expect(within(selector).getByText("General")).toBeInTheDocument();
  });
});
