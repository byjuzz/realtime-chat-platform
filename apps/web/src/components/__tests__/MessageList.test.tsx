import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@realtime-chat/shared";
import { MessageList } from "../MessageList";

describe("MessageList", () => {
  it("muestra un estado vacío cuando no hay mensajes", () => {
    render(<MessageList messages={[]} />);
    expect(screen.getByText("Todavía no hay mensajes.")).toBeInTheDocument();
  });

  it("renderiza los mensajes, mostrando el autor solo en los mensajes ajenos", () => {
    const messages: ChatMessage[] = [
      { id: "1", roomId: "room-1", authorId: "a1", authorName: "Ada", text: "hola", ts: Date.now() },
      { id: "2", roomId: "room-1", authorId: "a2", authorName: "Grace", text: "qué tal", ts: Date.now() },
    ];
    render(<MessageList messages={messages} currentUserId="a1" />);

    // El mensaje propio (a1/Ada) no repite el nombre; el ajeno (a2/Grace) sí.
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByText("Grace")).toBeInTheDocument();
    expect(screen.getByText(/hola/)).toBeInTheDocument();
    expect(screen.getByText(/qué tal/)).toBeInTheDocument();
  });

  it("muestra el botón de cargar mensajes anteriores cuando hasMoreHistory es true", async () => {
    const onLoadMore = vi.fn();
    render(<MessageList messages={[]} hasMoreHistory onLoadMore={onLoadMore} />);

    const button = screen.getByRole("button", { name: "Cargar mensajes anteriores" });
    await userEvent.click(button);
    expect(onLoadMore).toHaveBeenCalled();
  });

  it("muestra estado de carga en el botón mientras historyLoading es true", () => {
    render(<MessageList messages={[]} hasMoreHistory historyLoading />);
    expect(screen.getByRole("button", { name: "Cargando..." })).toBeDisabled();
  });

  it("muestra un error de historial cuando se provee", () => {
    render(<MessageList messages={[]} historyError="No se pudo cargar el historial." />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el historial.");
  });
});
