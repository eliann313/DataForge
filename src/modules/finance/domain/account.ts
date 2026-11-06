import { FinanceError, type Currency } from "./money";

export interface FinancialAccount {
  id: string;
  name: string;
  currency: Currency;
  createdAt: string;
  type: "bank" | "card";
}

export function validateAccountName(raw: string): string {
  const name = raw.trim();
  if (!name || name.length > 80) {
    throw new FinanceError("validation", "El nombre de la cuenta debe tener entre 1 y 80 caracteres.");
  }
  return name;
}
