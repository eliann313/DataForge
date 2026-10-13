import { describe, expect, it } from "vitest";
import { escapeIdentifier, statusLabel } from "./contract";
import { DuckDBManager } from "./manager";

describe("escapeIdentifier", () => {
  it("envuelve identificadores simples", () => {
    expect(escapeIdentifier("ventas")).toBe('"ventas"');
  });

  it("admite espacios y Unicode entrecomillando", () => {
    expect(escapeIdentifier("mi tabla")).toBe('"mi tabla"');
    expect(escapeIdentifier("año")).toBe('"año"');
  });

  it("duplica comillas internas (intento de inyección)", () => {
    expect(escapeIdentifier('x"; DROP TABLE t; --')).toBe(
      '"x""; DROP TABLE t; --"',
    );
  });

  it("rechaza vacío y NUL", () => {
    expect(() => escapeIdentifier("")).toThrow();
    expect(() => escapeIdentifier("a\0b")).toThrow();
  });
});

describe("statusLabel", () => {
  it("etiqueta en español cada estado", () => {
    expect(statusLabel("idle")).toBe("Motor no inicializado");
    expect(statusLabel("ready")).toBe("Motor listo");
    expect(statusLabel("error")).toBe("Error del motor");
  });
});

describe("motor sin inicializar", () => {
  it("falla con Error real y guía en español (nunca objeto plano)", async () => {
    const engine = new DuckDBManager();
    let failure: unknown = null;
    try {
      await engine.getCount();
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/no está listo/);
  });
});
