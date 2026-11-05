import type { Currency } from "../domain/money";
import type {
  FinancialTransaction,
  MovementKind,
} from "../domain/transaction";
import type { FinancialAccount } from "../domain/account";

export interface TransactionRepository {
  save(tx: FinancialTransaction): Promise<void>;
  /** Persiste el lote completo en una sola operación atómica. */
  saveMany(transactions: FinancialTransaction[]): Promise<void>;
  findById(id: string): Promise<FinancialTransaction | null>;
  list(): Promise<FinancialTransaction[]>;
  delete(id: string): Promise<void>;
  saveAccount(account: FinancialAccount): Promise<void>;
  listAccounts(): Promise<FinancialAccount[]>;
  findAccountById(id: string): Promise<FinancialAccount | null>;
  listCategories(): Promise<FinanceCategory[]>;
}

export interface FinanceCategory { id: string; name: string; createdAt: string }

export interface CreateInput {
  date: string;
  description: string;
  kind: MovementKind;
  /** Texto es-AR ("1.234,56"); se convierte a centavos exactos. */
  amount: string;
  currency: Currency;
  category: string;
  notes?: string;
  accountId?: string;
  destinationAccountId?: string;
  linkedTransactionId?: string;
}

export interface UpdateInput extends CreateInput {
  id: string;
}

export interface CurrencyTotal {
  currency: Currency;
  income: number;
  expense: number;
  refunds: number;
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
  refunds: number;
  balance: number;
}
