import { describe, expect, it } from "vitest";
import { escapeIdentifier, statusLabel } from "./contract";

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
