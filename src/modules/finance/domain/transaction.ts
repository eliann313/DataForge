import { FinanceError, type Currency } from "./money";

// Movimiento de Finanzas Lite (E6): registro manual, sin cuentas ni
// transferencias (fases 6–7). El signo lo da `kind`; el importe es exacto.
export type MovementKind = "ingreso" | "gasto";

export interface FinancialTransaction {
  id: string;
  /** Fecha contable ISO (YYYY-MM-DD). El corte mensual usa este campo. */
  date: string;
  description: string;
  kind: MovementKind;
  amountMinor: number;
  currency: Currency;
  category: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const MAX_TEXT = { description: 200, category: 60, notes: 500 } as const;

export function validateDate(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new FinanceError("validation", "La fecha debe ser YYYY-MM-DD.");
  }
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new FinanceError("validation", `Fecha inexistente: ${raw}.`);
  }
  return raw;
}

export function validateText(
  field: "description" | "category" | "notes",
  raw: string,
): string {
  const value = raw.trim();
  if (field !== "notes" && value.length === 0) {
    throw new FinanceError("validation", `El campo ${field} está vacío.`);
  }
  if (value.length > MAX_TEXT[field]) {
    throw new FinanceError(
      "validation",
      `El campo ${field} supera ${MAX_TEXT[field]} caracteres.`,
    );
  }
  return value;
}

/** Mes contable "YYYY-MM" a partir de la fecha del movimiento. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}
