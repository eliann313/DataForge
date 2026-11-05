import { FinanceError, parseAmount, type Currency } from "../domain/money";
import { validateDate, validateText, type FinancialTransaction, type MovementKind } from "../domain/transaction";
import type { FinancialAccount } from "../domain/account";
import type { TransactionRepository } from "./ports";

export type ImportField = "date" | "description" | "kind" | "amount" | "category";
export type ImportMapping = Record<ImportField, number>;
export interface ImportRow { line: number; transaction?: FinancialTransaction; duplicate: boolean; error?: string }
export interface ImportPreview { rows: ImportRow[]; validCount: number; duplicateCount: number; errorCount: number }

export class FinanceImportService {
  constructor(private readonly repository: TransactionRepository, private readonly generateId: () => string = () => crypto.randomUUID(), private readonly now: () => string = () => new Date().toISOString()) {}

  async preview(rows: string[][], mapping: ImportMapping, currency: Currency, account: FinancialAccount): Promise<ImportPreview> {
    const existing = await this.repository.list();
    const keys = new Set(existing.map(duplicateKey));
    const result: ImportRow[] = [];
    rows.forEach((row, index) => {
      try {
        const get = (field: ImportField) => row[mapping[field]] ?? "";
        const tx: FinancialTransaction = {
          id: this.generateId(), date: normalizeDate(get("date")),
          description: validateText("description", get("description")),
          kind: normalizeKind(get("kind")), amountMinor: parseAmount(get("amount")), currency,
          category: validateText("category", get("category")), notes: "", accountId: account.id,
          createdAt: this.now(), updatedAt: this.now(),
        };
        const key = duplicateKey(tx);
        const duplicate = keys.has(key);
        keys.add(key);
        result.push({ line: index + 2, transaction: tx, duplicate });
      } catch (cause) {
        result.push({ line: index + 2, duplicate: false, error: cause instanceof Error ? cause.message : "Fila inválida." });
      }
    });
    return { rows: result, validCount: result.filter((row) => row.transaction && !row.duplicate).length, duplicateCount: result.filter((row) => row.duplicate).length, errorCount: result.filter((row) => row.error).length };
  }

  async confirm(preview: ImportPreview): Promise<number> {
    if (preview.errorCount > 0 || preview.rows.some((row) => row.error)) throw new FinanceError("validation", "Corrige todas las filas con errores antes de importar.");
    const selected = preview.rows.filter((row) => row.transaction && !row.duplicate).map((row) => row.transaction!);
    if (!selected.length) throw new FinanceError("validation", "No hay movimientos nuevos para importar.");
    const current = new Set((await this.repository.list()).map(duplicateKey));
    if (selected.some((tx) => current.has(duplicateKey(tx)))) throw new FinanceError("validation", "Los movimientos cambiaron desde la vista previa. Vuelve a revisar los duplicados.");
    await this.repository.saveMany(selected);
    return selected.length;
  }
}

function normalizeDate(raw: string): string {
  const value = raw.trim();
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  return validateDate(dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : value);
}
function normalizeKind(raw: string): MovementKind {
  const value = raw.trim().toLocaleLowerCase("es-AR");
  if (["ingreso", "income", "credit"].includes(value)) return "ingreso";
  if (["gasto", "egreso", "expense", "debit"].includes(value)) return "gasto";
  throw new FinanceError("validation", `Tipo de movimiento no reconocido: «${raw}». Usa ingreso o gasto.`);
}
function duplicateKey(tx: FinancialTransaction): string {
  return JSON.stringify([tx.date, tx.kind, tx.amountMinor, tx.currency, tx.accountId, tx.description.trim().toLocaleLowerCase("es-AR")]);
}
