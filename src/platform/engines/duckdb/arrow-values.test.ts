import { describe, expect, it } from "vitest";
import { normalizeArrowValue, stringifyArrowValue } from "./arrow-values";

describe("normalizeArrowValue", () => {
  it("normaliza BigInt en structs y listas sin perder enteros grandes", () => {
    const value = {
      id: BigInt("42"),
      nested: { values: [BigInt("9007199254740993"), BigInt("-7")] },
    };

    expect(normalizeArrowValue(value)).toEqual({
      id: 42,
      nested: { values: ["9007199254740993", -7] },
    });
  });

  it("reemplaza ciclos y mantiene serializables las celdas resultantes", () => {
    const value: { nested?: unknown } = {};
    value.nested = [value];

    const normalized = normalizeArrowValue(value);
    expect(normalized).toEqual({ nested: ["[Circular]"] });
    expect(() => JSON.stringify(normalized)).not.toThrow();
  });

  it("preserva fechas y buffers tipados de Arrow", () => {
    const date = new Date("2024-01-02T03:04:05.000Z");
    const bytes = new Uint8Array([1, 2, 3]);
    const normalized = normalizeArrowValue({ date, bytes }) as { date: Date; bytes: Uint8Array };

    expect(normalized.date).toBe(date);
    expect(normalized.bytes).toBe(bytes);
    expect(JSON.stringify(normalized)).toBe('{"date":"2024-01-02T03:04:05.000Z","bytes":{"0":1,"1":2,"2":3}}');
  });

  it("serializa BigInt devuelto por toJSON en objetos con prototipo", () => {
    class ArrowLikeStruct {
      toJSON() {
        return { nested: [BigInt("9007199254740993")] };
      }
    }

    expect(stringifyArrowValue(new ArrowLikeStruct())).toBe('{"nested":["9007199254740993"]}');
  });
});
