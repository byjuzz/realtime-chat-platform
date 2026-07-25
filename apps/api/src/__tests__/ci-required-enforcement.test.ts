import { describe, expect, it } from "vitest";

// ARCHIVO TEMPORAL — Fase 6.2, prueba controlada de bloqueo de merge.
// Falla intencionalmente para validar que CI / Required propague el
// fallo de CI / Quality y que el ruleset bloquee el merge del PR.
// Se elimina antes de fusionar (ver docs/adr/ADR-007-continuous-integration.md).
describe("required checks enforcement", () => {
  it("fails intentionally to prove merge blocking", () => {
    expect("blocked").toBe("mergeable");
  });
});
