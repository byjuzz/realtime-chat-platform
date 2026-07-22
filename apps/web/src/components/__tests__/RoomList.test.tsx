import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PublicRoom } from "@realtime-chat/shared";
import { RoomList } from "../RoomList";

const rooms: PublicRoom[] = [
  { id: "1", name: "General", slug: "general", createdAt: 0, connectedUsers: 2 },
  { id: "2", name: "Tecnología", slug: "tecnologia", createdAt: 1 },
];

describe("RoomList", () => {
  it("muestra las salas y marca la activa", () => {
    render(<RoomList rooms={rooms} activeRoomSlug="tecnologia" onSelect={vi.fn()} />);
    const activeButton = screen.getByRole("button", { name: /Tecnología/ });
    expect(activeButton).toHaveAttribute("aria-current", "true");
  });

  it("llama a onSelect con el slug al hacer click", async () => {
    const onSelect = vi.fn();
    render(<RoomList rooms={rooms} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /General/ }));
    expect(onSelect).toHaveBeenCalledWith("general");
  });

  it("muestra un estado vacío cuando no hay salas", () => {
    render(<RoomList rooms={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("No hay salas todavía.")).toBeInTheDocument();
  });

  it("muestra un error cuando se provee", () => {
    render(<RoomList rooms={[]} error="No se pudo cargar la lista de salas." onSelect={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar la lista de salas.");
  });
});
