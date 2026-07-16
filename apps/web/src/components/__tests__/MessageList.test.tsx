import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@realtime-chat/shared";
import { MessageList } from "../MessageList";

describe("MessageList", () => {
  it("muestra un estado vacío cuando no hay mensajes", () => {
    render(<MessageList messages={[]} />);
    expect(screen.getByText("Todavía no hay mensajes.")).toBeInTheDocument();
  });

  it("renderiza los mensajes, mostrando el autor solo en los mensajes ajenos", () => {
    const messages: ChatMessage[] = [
      { id: "1", authorId: "a1", authorName: "Ada", text: "hola", ts: Date.now() },
      { id: "2", authorId: "a2", authorName: "Grace", text: "qué tal", ts: Date.now() },
    ];
    render(<MessageList messages={messages} currentUserId="a1" />);

    // El mensaje propio (a1/Ada) no repite el nombre; el ajeno (a2/Grace) sí.
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByText("Grace")).toBeInTheDocument();
    expect(screen.getByText(/hola/)).toBeInTheDocument();
    expect(screen.getByText(/qué tal/)).toBeInTheDocument();
  });
});
