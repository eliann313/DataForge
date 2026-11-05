// API pública del módulo finance (E6): entidades y reglas estrictas,
// casos de uso, puertos y repositorios. Sin imports internos entre módulos.
export type { Currency, Money } from "./domain/money";
export { parseAmount, formatMoney, FinanceError, MAX_MINOR } from "./domain/money";
export type { FinancialTransaction, MovementKind } from "./domain/transaction";
export type { FinancialAccount } from "./domain/account";
export { validateAccountName } from "./domain/account";
export { validateDate, validateText, monthOf, MAX_TEXT } from "./domain/transaction";
export type {
  TransactionRepository,
  CreateInput,
  UpdateInput,
  CurrencyTotal,
  CategoryTotal,
  MonthPoint,
} from "./application/ports";
export { FinanceService, type FinanceDeps } from "./application/service";
export { MemoryTransactionRepository } from "./infrastructure/memory";
export { IndexedDBTransactionRepository } from "./infrastructure/indexeddb";
export { FinanceImportService, type ImportField, type ImportMapping, type ImportRow, type ImportPreview } from "./application/import-service";
export { readFinanceFile, parseCsv, type TabularFile } from "./application/import-file";
