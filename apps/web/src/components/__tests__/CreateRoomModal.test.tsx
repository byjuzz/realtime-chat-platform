import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateRoomModal } from "../CreateRoomModal";

describe("CreateRoomModal", () => {
  it("no renderiza nada cuando open es false", () => {
    render(<CreateRoomModal open={false} onCreate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("enfoca el input al abrir y llama a onCreate con el nombre recortado", async () => {
    const onCreate = vi.fn();
    render(<CreateRoomModal open onCreate={onCreate} onClose={vi.fn()} />);

    const input = screen.getByLabelText("Nombre de la sala");
    expect(input).toHaveFocus();

    await userEvent.type(input, "  Tecnología  ");
    await userEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    expect(onCreate).toHaveBeenCalledWith("Tecnología", false);
  });

  it("cierra con Escape y devuelve el foco al disparador", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const onClose = vi.fn();
    render(<CreateRoomModal open onCreate={vi.fn()} onClose={onClose} />);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();

    document.body.removeChild(trigger);
  });

  it("deshabilita el botón mientras submitting es true", () => {
    render(<CreateRoomModal open submitting onCreate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Creando..." })).toBeDisabled();
  });

  it("muestra un error cuando se provee", () => {
    render(<CreateRoomModal open error="Ya existe una sala con ese nombre." onCreate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ya existe una sala con ese nombre.");
  });
});
