// Repositorio en memoria (pruebas y desarrollo).
import type { FinancialTransaction } from "../domain/transaction";
import type { TransactionRepository } from "../application/ports";
import type { FinancialAccount } from "../domain/account";

export class MemoryTransactionRepository implements TransactionRepository {
  private readonly store = new Map<string, FinancialTransaction>();
  private readonly accounts = new Map<string, FinancialAccount>();

  async save(tx: FinancialTransaction): Promise<void> {
    this.store.set(tx.id, { ...tx });
  }

  async findById(id: string): Promise<FinancialTransaction | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async list(): Promise<FinancialTransaction[]> {
    return [...this.store.values()].map((t) => ({ ...t }));
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async saveAccount(account: FinancialAccount): Promise<void> { this.accounts.set(account.id, { ...account }); }
  async listAccounts(): Promise<FinancialAccount[]> { return [...this.accounts.values()].map((a) => ({ ...a })); }
  async findAccountById(id: string): Promise<FinancialAccount | null> { const account = this.accounts.get(id); return account ? { ...account } : null; }
}
