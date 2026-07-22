import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JoinForm } from "../JoinForm";

describe("JoinForm", () => {
  it("llama a onJoin con el nombre recortado al enviar", async () => {
    const onJoin = vi.fn();
    render(<JoinForm onJoin={onJoin} />);

    await userEvent.type(screen.getByLabelText("Tu nombre"), "  Ada  ");
    await userEvent.click(screen.getByRole("button", { name: "Entrar al chat" }));

    expect(onJoin).toHaveBeenCalledWith("Ada");
  });

  it("no llama a onJoin si el nombre está vacío", async () => {
    const onJoin = vi.fn();
    render(<JoinForm onJoin={onJoin} />);

    await userEvent.click(screen.getByRole("button", { name: "Entrar al chat" }));

    expect(onJoin).not.toHaveBeenCalled();
  });

  it("muestra un mensaje de error cuando se provee", () => {
    render(<JoinForm onJoin={vi.fn()} error="Nombre inválido" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nombre inválido");
  });
});
