import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UseChatSocketResult } from "../hooks/useChatSocket";

const mockState: { value: UseChatSocketResult } = {
  value: {
    connected: true,
    currentUser: null,
    users: [],
    messages: [],
    joinError: null,
    sendError: null,
    historyLoading: false,
    historyError: null,
    hasMoreHistory: false,
    join: vi.fn(),
    sendMessage: vi.fn(),
    loadMoreHistory: vi.fn(),
  },
};

vi.mock("../hooks/useChatSocket", () => ({
  useChatSocket: () => mockState.value,
}));

const { default: App } = await import("../App");

describe("App - transición de ingreso a chat", () => {
  it("muestra JoinForm cuando no hay usuario actual", () => {
    mockState.value = { ...mockState.value, currentUser: null };
    render(<App />);
    expect(screen.getByRole("form", { name: "Unirse al chat" })).toBeInTheDocument();
  });

  it("muestra ChatRoom cuando ya existe un usuario actual", () => {
    mockState.value = {
      ...mockState.value,
      currentUser: { id: "a1", name: "Ada", guestUserId: "guest-1" },
    };
    render(<App />);
    expect(screen.getByRole("region", { name: "Sala de chat" })).toBeInTheDocument();
  });
});
