// Repositorio en memoria (pruebas y desarrollo).
import type { FinancialTransaction } from "../domain/transaction";
import type { TransactionRepository } from "../application/ports";

export class MemoryTransactionRepository implements TransactionRepository {
  private readonly store = new Map<string, FinancialTransaction>();

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
}
