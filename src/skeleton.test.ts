import { describe, expect, it } from "vitest";

// 0A.1: prueba mínima para verificar que Vitest y el tipado funcionan.
// No valida lógica de producto: aún no hay dominio implementado.
describe("esqueleto 0A.1", () => {
  it("ejecuta el runner de pruebas", () => {
    expect(1 + 1).toBe(2);
  });
});
