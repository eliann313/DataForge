import type { NumericSummary } from "./manager";

/** Un fallo de agregación no invalida la importación ni su vista de filas. */
export async function tryNumericSummary(
  column: string,
  summarize: (column: string) => Promise<NumericSummary>,
): Promise<{ numeric: NumericSummary | null; numericError: string | null }> {
  if (!column) return { numeric: null, numericError: null };
  try {
    return { numeric: await summarize(column), numericError: null };
  } catch (cause) {
    return { numeric: null, numericError: cause instanceof Error ? cause.message : "No se pudo calcular el resumen numérico." };
  }
}
