// Casos de uso de Finanzas Lite (E6). Aritmética solo con centavos enteros;
// los resúmenes separan monedas y nunca las convierten ni las suman.
import {
  FinanceError,
  parseAmount,
  type Currency,
} from "../domain/money";
import {
  monthOf,
  validateDate,
  validateText,
  type FinancialTransaction,
  type MovementKind,
} from "../domain/transaction";
import { validateAccountName, type FinancialAccount } from "../domain/account";
import type {
  CategoryTotal,
  CreateInput,
  CurrencyTotal,
  MonthPoint,
  TransactionRepository,
  UpdateInput,
} from "./ports";

export interface FinanceDeps {
  transactions: TransactionRepository;
  now?: () => string;
  generateId?: () => string;
}

const CURRENCIES: Currency[] = ["ARS", "USD"];

export class FinanceService {
  private readonly transactions: TransactionRepository;
  private readonly now: () => string;
  private readonly generateId: () => string;

  constructor(deps: FinanceDeps) {
    this.transactions = deps.transactions;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.generateId = deps.generateId ?? (() => crypto.randomUUID());
  }

  async create(input: CreateInput): Promise<FinancialTransaction> {
    const timestamp = this.now();
    const account = await this.resolveAccount(input.accountId, input.currency);
    const destination = input.kind === "transferencia" ? await this.requireAccount(input.destinationAccountId) : null;
    if (destination && (destination.id === account.id || destination.currency !== account.currency)) {
      throw new FinanceError("validation", "La transferencia requiere cuentas distintas y de la misma moneda.");
    }
    const tx: FinancialTransaction = {
      id: this.generateId(),
      date: validateDate(input.date),
      description: validateText("description", input.description),
      kind: validateKind(input.kind),
      amountMinor: parseAmount(input.amount),
      currency: validateCurrency(input.currency),
      category: validateText("category", input.category),
      notes: validateText("notes", input.notes ?? ""),
      accountId: account.id,
      destinationAccountId: undefined,
      ...(destination ? { destinationAccountId: destination.id } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.transactions.save(tx);
    return tx;
  }

  async update(input: UpdateInput): Promise<FinancialTransaction> {
    const current = await this.require(input.id);
    const account = await this.resolveAccount(input.accountId ?? current.accountId, input.currency);
    const destination = input.kind === "transferencia" ? await this.requireAccount(input.destinationAccountId) : null;
    if (destination && (destination.id === account.id || destination.currency !== account.currency)) throw new FinanceError("validation", "La transferencia requiere cuentas distintas y de la misma moneda.");
    const updated: FinancialTransaction = {
      ...current,
      date: validateDate(input.date),
      description: validateText("description", input.description),
      kind: validateKind(input.kind),
      amountMinor: parseAmount(input.amount),
      currency: validateCurrency(input.currency),
      category: validateText("category", input.category),
      notes: validateText("notes", input.notes ?? ""),
      accountId: account.id,
      destinationAccountId: undefined,
      ...(destination ? { destinationAccountId: destination.id } : {}),
      updatedAt: this.now(),
    };
    await this.transactions.save(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.transactions.delete(id);
  }

  get(id: string): Promise<FinancialTransaction> {
    return this.require(id);
  }

  async list(): Promise<FinancialTransaction[]> {
    const rows = await this.transactions.list();
    return rows.sort((a, b) =>
      a.date === b.date
        ? b.createdAt.localeCompare(a.createdAt)
        : b.date.localeCompare(a.date),
    );
  }

  async accounts(): Promise<FinancialAccount[]> {
    const accounts = await this.transactions.listAccounts();
    const defaults: FinancialAccount[] = [
      { id: "account-default", name: "Cuenta principal", currency: "ARS", createdAt: this.now() },
      { id: "account-default-usd", name: "Cuenta en dólares", currency: "USD", createdAt: this.now() },
    ];
    for (const account of defaults) if (!accounts.some((existing) => existing.currency === account.currency)) await this.transactions.saveAccount(account);
    const persisted = await this.transactions.listAccounts();
    return [...persisted, ...defaults.filter((account) => !persisted.some((existing) => existing.currency === account.currency))];
  }

  async createAccount(name: string, currency: Currency): Promise<FinancialAccount> {
    const account = { id: this.generateId(), name: validateAccountName(name), currency: validateCurrency(currency), createdAt: this.now() };
    await this.transactions.saveAccount(account);
    return account;
  }

  async accountBalances(): Promise<Array<FinancialAccount & { balanceMinor: number }>> {
    const [accounts, movements] = await Promise.all([this.accounts(), this.transactions.list()]);
    return accounts.map((account) => {
      let balanceMinor = 0;
      for (const movement of movements) {
        if (movement.currency !== account.currency) continue;
        if (movement.accountId === account.id) balanceMinor += movement.kind === "ingreso" ? movement.amountMinor : -movement.amountMinor;
        if (movement.kind === "transferencia" && movement.destinationAccountId === account.id) balanceMinor += movement.amountMinor;
      }
      return { ...account, balanceMinor };
    });
  }

  /** Resumen del mes por moneda, en centavos exactos. */
  async monthlySummary(year: number, month: number): Promise<CurrencyTotal[]> {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const rows = (await this.transactions.list()).filter((t) =>
      t.date.startsWith(prefix),
    );
    return CURRENCIES.map((currency) => {
      let income = 0;
      let expense = 0;
      for (const t of rows) {
        if (t.currency !== currency || t.kind === "transferencia") continue;
        if (t.kind === "ingreso") income += t.amountMinor;
        else expense += t.amountMinor;
      }
      return { currency, income, expense, balance: income - expense };
    });
  }

  /** Totales por categoría del mes (una fila por categoría/moneda/tipo). */
  async categoryBreakdown(year: number, month: number): Promise<CategoryTotal[]> {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const rows = (await this.transactions.list()).filter((t) =>
      t.date.startsWith(prefix),
    );
    const map = new Map<string, CategoryTotal>();
    for (const t of rows) {
      if (t.kind === "transferencia") continue;
      const key = JSON.stringify([t.category, t.currency, t.kind]);
      const entry = map.get(key) ?? {
        category: t.category,
        currency: t.currency,
        kind: t.kind,
        total: 0,
        count: 0,
      };
      entry.total += t.amountMinor;
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  /** Evolución de los últimos N meses (incluido el de referencia), por moneda. */
  async evolution(year: number, month: number, count = 6): Promise<MonthPoint[]> {
    const rows = await this.transactions.list();
    const points: MonthPoint[] = [];
    let y = year;
    let m = month;
    for (let i = 0; i < count; i++) {
      const prefix = `${y}-${String(m).padStart(2, "0")}`;
      for (const currency of CURRENCIES) {
        let income = 0;
        let expense = 0;
        for (const t of rows) {
          if (!t.date.startsWith(prefix) || t.currency !== currency || t.kind === "transferencia") continue;
          if (t.kind === "ingreso") income += t.amountMinor;
          else expense += t.amountMinor;
        }
        points.push({ month: prefix, currency, income, expense, balance: income - expense });
      }
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return points.reverse();
  }

  private async require(id: string): Promise<FinancialTransaction> {
    const found = await this.transactions.findById(id);
    if (!found) throw new FinanceError("not-found", "Movimiento inexistente.");
    return found;
  }

  private async resolveAccount(id: string | undefined, currency: Currency): Promise<FinancialAccount> {
    const accounts = await this.accounts();
    const account = id ? await this.requireAccount(id) : accounts.find((item) => item.currency === currency) ?? accounts[0];
    if (account.currency !== currency) throw new FinanceError("validation", "La moneda del movimiento debe coincidir con la cuenta.");
    return account;
  }

  private async requireAccount(id?: string): Promise<FinancialAccount> {
    if (!id) throw new FinanceError("validation", "Selecciona una cuenta.");
    const account = await this.transactions.findAccountById(id);
    if (!account) throw new FinanceError("not-found", "Cuenta inexistente.");
    return account;
  }
}

function validateKind(kind: string): MovementKind {
  if (kind !== "ingreso" && kind !== "gasto" && kind !== "transferencia") {
    throw new FinanceError("validation", "El tipo debe ser ingreso, gasto o transferencia.");
  }
  return kind;
}

function validateCurrency(currency: string): Currency {
  if (currency !== "ARS" && currency !== "USD") {
    throw new FinanceError("validation", "La moneda debe ser ARS o USD.");
  }
  return currency;
}

export { monthOf };
