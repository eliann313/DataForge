/** Convierte BigInt en valores Arrow anidados sin perder precisión. */
export function normalizeArrowValue(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (typeof value === "bigint") {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : String(value);
  }
  if (value === null || typeof value !== "object") return value;

  if (ancestors.has(value)) return "[Circular]";
  if (Array.isArray(value)) {
    ancestors.add(value);
    const normalized = value.map((item) => normalizeArrowValue(item, ancestors));
    ancestors.delete(value);
    return normalized;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  ancestors.add(value);
  const normalized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    normalized[key] = normalizeArrowValue(item, ancestors);
  }
  ancestors.delete(value);
  return normalized;
}

/** Serializa celdas estructuradas convirtiendo BigInt incluso tras toJSON(). */
export function stringifyArrowValue(value: unknown): string | undefined {
  return JSON.stringify(normalizeArrowValue(value), (_key, item: unknown) => {
    if (typeof item !== "bigint") return item;
    const number = Number(item);
    return Number.isSafeInteger(number) ? number : String(item);
  });
}
