import type { Currency } from "../domain/money";
import type {
  FinancialTransaction,
  MovementKind,
} from "../domain/transaction";

export interface TransactionRepository {
  save(tx: FinancialTransaction): Promise<void>;
  findById(id: string): Promise<FinancialTransaction | null>;
  list(): Promise<FinancialTransaction[]>;
  delete(id: string): Promise<void>;
}

export interface CreateInput {
  date: string;
  description: string;
  kind: MovementKind;
  /** Texto es-AR ("1.234,56"); se convierte a centavos exactos. */
  amount: string;
  currency: Currency;
  category: string;
  notes?: string;
}

export interface UpdateInput extends CreateInput {
  id: string;
}

export interface CurrencyTotal {
  currency: Currency;
  income: number;
  expense: number;
  balance: number;
}

export interface CategoryTotal {
  category: string;
  currency: Currency;
  kind: MovementKind;
  total: number;
  count: number;
}

export interface MonthPoint {
  month: string;
  currency: Currency;
  income: number;
  expense: number;
  balance: number;
}
