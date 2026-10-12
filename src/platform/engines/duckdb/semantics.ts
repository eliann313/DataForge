// Roles semánticos y avisos de formato (E4). Puro, probado en Node.
// Los roles son interpretación editable del usuario; nunca cambian datos.
// La selección de columnas y la corrección de tipos son transformaciones (R2).

export type SemanticRole =
  | "medida"
  | "dimension"
  | "fecha"
  | "identificador"
  | "texto"
  | "desconocido";

export const ROLES: SemanticRole[] = [
  "medida",
  "dimension",
  "fecha",
  "identificador",
  "texto",
  "desconocido",
];

/** Sugerencia inicial por tipo físico y nombre (editable en la UI). */
export function suggestRole(type: string, name: string): SemanticRole {
  const t = type.toUpperCase();
  const n = name.toLowerCase();
  if (n === "id" || /(^|_)id($|_)/.test(n)) {
    if (/INT|BIGINT|SMALLINT|TINYINT|HUGEINT|UUID/.test(t)) return "identificador";
  }
  if (/DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL/.test(t)) return "medida";
  if (/INT|BIGINT|SMALLINT|TINYINT|HUGEINT/.test(t)) {
    return /cantidad|importe|precio|total|valor|monto|edad|nota|punto/.test(n)
      ? "medida"
      : "identificador";
  }
  if (/DATE|TIMESTAMP|TIME|INTERVAL/.test(t)) return "fecha";
  if (/BOOL/.test(t)) return "dimension";
  if (/VARCHAR|CHAR|TEXT|STRING/.test(t)) return "texto";
  return "desconocido";
}

/**
 * Aviso sobre un valor textual con pinta regional. No corrige ni infiere:
 * solo señala para que la fase 2 lo interprete.
 */
export function valueHint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v)) {
    return "Posible fecha en formato regional: se conserva como texto (interpretación en fase 2).";
  }
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(v) || /^-?\d+,\d+$/.test(v)) {
    return "Posible decimal con coma: se conserva como texto (interpretación en fase 2).";
  }
  return null;
}
