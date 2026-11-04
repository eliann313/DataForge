// Dinero exacto (Finanzas Lite, E6): unidades menores enteras, sin flotantes
// binarios. Se conserva moneda original; ARS y USD jamás se suman ni se
// convierten (sin cotización en Lite).
export type Currency = "ARS" | "USD";

export interface Money {
  /** Centavos enteros (p. ej. 15050 = $150,50). Siempre > 0 en movimientos. */
  minor: number;
  currency: Currency;
}

export const MAX_MINOR = 999_999_999_99; // $999.999.999,99

/**
 * Interpreta un importe escrito en es-AR: "1234,56", "1.234,56", "1234.56"
 * o "1234". Redondeo mitad hacia arriba a 2 decimales, explícito.
 */
export function parseAmount(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, "");
  if (cleaned.length === 0) {
    throw new FinanceError("validation", "El importe está vacío.");
  }
  let normalized: string;
  if (cleaned.includes(",")) {
    // Formato es-AR: puntos de miles opcionales, coma decimal.
    if (
      !/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned) &&
      !/^-?\d+(,\d+)?$/.test(cleaned)
    ) {
      throw new FinanceError("validation", `Importe inválido: «${raw}».`);
    }
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Sin coma: el punto seguido de exactamente 3 dígitos es separador de
    // miles ("2.500" → 2500); en otro caso es decimal ("150.50", "2.5").
    if (!/^-?\d+(\.\d+)?$/.test(cleaned) && !/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      throw new FinanceError("validation", `Importe inválido: «${raw}».`);
    }
    normalized = /^-?\d{1,3}(\.\d{3})+$/.test(cleaned)
      ? cleaned.replace(/\./g, "")
      : cleaned;
  }
  if (normalized.startsWith("-")) {
    throw new FinanceError("validation", "El importe debe ser mayor que cero.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const wholeDigits = whole.replace(/^0+/, "") || "0";
  // El límite admite hasta nueve dígitos enteros. Limitar antes de convertir
  // también evita perder precisión al procesar entradas muy largas.
  if (wholeDigits.length > 9) {
    throw new FinanceError("validation", "El importe supera el máximo admitido.");
  }
  const cents = Number(fraction.slice(0, 2).padEnd(2, "0"));
  // El tercer decimal decide el redondeo mitad hacia arriba. Toda la
  // aritmética desde aquí usa enteros exactos, sin multiplicar un decimal binario.
  const minor = Number(wholeDigits) * 100 + cents + (fraction.length >= 3 && fraction[2] >= "5" ? 1 : 0);
  if (minor <= 0) {
    throw new FinanceError("validation", "El importe debe ser mayor que cero.");
  }
  if (minor > MAX_MINOR) {
    throw new FinanceError("validation", "El importe supera el máximo admitido.");
  }
  return minor;
}

export function formatMoney(minor: number, currency: Currency): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

export class FinanceError extends Error {
  readonly code:
    | "validation"
    | "not-found"
    | "storage-unavailable"
    | "storage-failed";
  constructor(
    code: "validation" | "not-found" | "storage-unavailable" | "storage-failed",
    message: string,
  ) {
    super(message);
    this.name = "FinanceError";
    this.code = code;
  }
}
