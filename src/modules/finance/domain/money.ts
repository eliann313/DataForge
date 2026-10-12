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
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
      throw new FinanceError("validation", `Importe inválido: «${raw}».`);
    }
    normalized = /^-?\d{1,3}(\.\d{3})+$/.test(cleaned)
      ? cleaned.replace(/\./g, "")
      : cleaned;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new FinanceError("validation", `Importe inválido: «${raw}».`);
  }
  // Mitad hacia arriba, explícito (Math.round: .5 hacia +∞).
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor) || minor <= 0) {
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
