import type { DatasetColumn } from "./source";

export interface AppendColumnMapping {
  outputName: string;
  leftColumn: string | null;
  rightColumn: string | null;
}

export interface AppendDefinition {
  id: string;
  name: string;
  leftVersionId: string;
  rightVersionId: string;
  columns: AppendColumnMapping[];
}

export interface JoinKeyMapping {
  leftColumn: string;
  rightColumn: string;
}

export type DatasetJoinType = "inner" | "left";
export type DatasetJoinCardinality = "one-to-one" | "many-to-one" | "one-to-many";

export interface JoinOutputColumn {
  side: "left" | "right";
  column: string;
  outputName: string;
}

export interface JoinDefinition {
  id: string;
  name: string;
  leftVersionId: string;
  rightVersionId: string;
  joinType: DatasetJoinType;
  cardinality: DatasetJoinCardinality;
  confirmFanout: boolean;
  keys: JoinKeyMapping[];
  columns: JoinOutputColumn[];
}

export interface DatasetCombinationPreview {
  leftRowCount: number;
  rightRowCount: number;
  outputRowCount: number;
  fanoutRowCount: number;
  columns: DatasetColumn[];
  rows: Record<string, unknown>[];
}

export interface CombinationValidation {
  valid: boolean;
  error: string | null;
  columns: DatasetColumn[];
}

const INTEGER_DIGITS: Record<string, number> = {
  TINYINT: 3,
  SMALLINT: 5,
  INTEGER: 10,
  BIGINT: 19,
};
const INTEGER_ORDER = ["TINYINT", "SMALLINT", "INTEGER", "BIGINT"];

export function validateAppendDefinition(
  leftColumns: readonly DatasetColumn[],
  rightColumns: readonly DatasetColumn[],
  definition: AppendDefinition,
): CombinationValidation {
  const fail = (error: string): CombinationValidation => ({ valid: false, error, columns: [] });
  if (!definition.id.trim() || !definition.name.trim()) return fail("La unión necesita identificador y nombre.");
  if (definition.name.trim().length > 80) return fail("El nombre de la unión no puede superar 80 caracteres.");
  if (!definition.leftVersionId || !definition.rightVersionId || definition.leftVersionId === definition.rightVersionId) {
    return fail("Seleccione dos versiones distintas para unir filas.");
  }
  if (definition.columns.length === 0 || definition.columns.length > 256) {
    return fail("La unión debe mapear entre 1 y 256 columnas.");
  }

  const outputs = new Set<string>();
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();
  const columns: DatasetColumn[] = [];
  for (const mapping of definition.columns) {
    const name = mapping.outputName.trim();
    if (!name || name.length > 128 || name.includes("\0")) return fail("Cada columna de salida necesita un nombre válido de hasta 128 caracteres.");
    const normalizedName = normalizeName(name);
    if (outputs.has(normalizedName)) return fail(`El nombre de salida «${name}» está repetido.`);
    outputs.add(normalizedName);
    if (mapping.leftColumn === null && mapping.rightColumn === null) return fail(`La columna «${name}» no está mapeada desde ninguna fuente.`);

    const left = mapping.leftColumn === null ? undefined : leftColumns.find((column) => column.name === mapping.leftColumn);
    const right = mapping.rightColumn === null ? undefined : rightColumns.find((column) => column.name === mapping.rightColumn);
    if (mapping.leftColumn !== null && !left) return fail(`No existe la columna izquierda «${mapping.leftColumn}».`);
    if (mapping.rightColumn !== null && !right) return fail(`No existe la columna derecha «${mapping.rightColumn}».`);
    if (left && usedLeft.has(left.name)) return fail(`La columna izquierda «${left.name}» se mapeó más de una vez.`);
    if (right && usedRight.has(right.name)) return fail(`La columna derecha «${right.name}» se mapeó más de una vez.`);
    if (left) usedLeft.add(left.name);
    if (right) usedRight.add(right.name);

    const type = left && right
      ? commonAppendType(left.type, right.type)
      : safeSqlType((left ?? right)!.type);
    if (!type) return fail(`Los tipos de «${left?.name ?? "(sin columna)"}» y «${right?.name ?? "(sin columna)"}» no se pueden combinar sin pérdida. Conviértalos explícitamente antes de unir.`);
    columns.push({
      name,
      type,
      nullable: !left || !right || left.nullable || right.nullable,
    });
  }
  return { valid: true, error: null, columns };
}

export function validateJoinDefinition(
  leftColumns: readonly DatasetColumn[],
  rightColumns: readonly DatasetColumn[],
  definition: JoinDefinition,
): CombinationValidation {
  const fail = (error: string): CombinationValidation => ({ valid: false, error, columns: [] });
  if (!definition.id.trim() || !definition.name.trim()) return fail("El JOIN necesita identificador y nombre.");
  if (definition.name.trim().length > 80) return fail("El nombre del JOIN no puede superar 80 caracteres.");
  if (!definition.leftVersionId || !definition.rightVersionId || definition.leftVersionId === definition.rightVersionId) {
    return fail("Seleccione dos versiones distintas para combinar.");
  }
  if (definition.joinType !== "inner" && definition.joinType !== "left") return fail("El tipo de JOIN no es válido.");
  if (!["one-to-one", "many-to-one", "one-to-many"].includes(definition.cardinality)) return fail("Confirme una cardinalidad válida.");
  if (!Array.isArray(definition.keys) || definition.keys.length === 0 || definition.keys.length > 10) {
    return fail("Seleccione entre 1 y 10 pares de claves para el JOIN.");
  }
  if (!Array.isArray(definition.columns) || definition.columns.length === 0 || definition.columns.length > 256) {
    return fail("El JOIN debe devolver entre 1 y 256 columnas.");
  }

  const leftKeys = new Set<string>();
  const rightKeys = new Set<string>();
  for (const key of definition.keys) {
    const left = leftColumns.find((column) => column.name === key.leftColumn);
    const right = rightColumns.find((column) => column.name === key.rightColumn);
    if (!left || !right) return fail("Una clave del JOIN ya no existe en el esquema seleccionado.");
    if (leftKeys.has(left.name) || rightKeys.has(right.name)) return fail("No repita una columna dentro de las claves del JOIN.");
    leftKeys.add(left.name);
    rightKeys.add(right.name);
    const leftType = safeSqlType(left.type);
    const rightType = safeSqlType(right.type);
    if (!leftType || leftType !== rightType) return fail(`Las claves «${left.name}» y «${right.name}» deben tener el mismo tipo compatible.`);
  }

  const outputNames = new Set<string>();
  const selectedLeft = new Set<string>();
  const selectedRight = new Set<string>();
  const columns: DatasetColumn[] = [];
  for (const output of definition.columns) {
    const name = output.outputName.trim();
    if (!name || name.length > 128 || name.includes("\0")) return fail("Cada columna de salida necesita un nombre válido de hasta 128 caracteres.");
    if (outputNames.has(normalizeName(name))) return fail(`El nombre de salida «${name}» está repetido.`);
    outputNames.add(normalizeName(name));
    const sourceColumns = output.side === "left" ? leftColumns : rightColumns;
    const source = sourceColumns.find((column) => column.name === output.column);
    if (!source) return fail(`No existe la columna de salida «${output.column}».`);
    const selected = output.side === "left" ? selectedLeft : selectedRight;
    if (selected.has(source.name)) return fail(`La columna «${source.name}» se repitió en la salida.`);
    selected.add(source.name);
    const type = safeSqlType(source.type);
    if (!type) return fail(`El tipo de «${source.name}» no se puede proyectar de forma segura en este JOIN.`);
    columns.push({
      name,
      type,
      nullable: output.side === "right" && definition.joinType === "left" ? true : source.nullable,
    });
  }
  return { valid: true, error: null, columns };
}

/** Tipo SQL cerrado derivado del esquema importado; no acepta nombres arbitrarios. */
export function safeSqlType(raw: string): string | null {
  const type = raw.trim().toUpperCase().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    INT: "INTEGER", INT2: "SMALLINT", INT4: "INTEGER", INT8: "BIGINT",
    FLOAT4: "FLOAT", FLOAT8: "DOUBLE", REAL: "FLOAT", TEXT: "VARCHAR", STRING: "VARCHAR",
    BOOL: "BOOLEAN", DATETIME: "TIMESTAMP", TIMESTAMP_S: "TIMESTAMP", TIMESTAMP_MS: "TIMESTAMP", TIMESTAMP_NS: "TIMESTAMP",
  };
  if (aliases[type]) return aliases[type];
  if (["BOOLEAN", "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "FLOAT", "DOUBLE", "VARCHAR", "DATE", "TIME", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE", "BLOB", "UUID"].includes(type)) return type;
  const decimal = /^DECIMAL\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(type);
  if (decimal) {
    const precision = Number(decimal[1]);
    const scale = Number(decimal[2]);
    if (precision >= 1 && precision <= 38 && scale >= 0 && scale <= precision) return `DECIMAL(${precision},${scale})`;
  }
  return null;
}

function commonAppendType(leftRaw: string, rightRaw: string): string | null {
  const left = safeSqlType(leftRaw);
  const right = safeSqlType(rightRaw);
  if (!left || !right) return null;
  if (left === right) return left;
  if (INTEGER_ORDER.includes(left) && INTEGER_ORDER.includes(right)) {
    return INTEGER_ORDER[Math.max(INTEGER_ORDER.indexOf(left), INTEGER_ORDER.indexOf(right))];
  }
  if (["FLOAT", "DOUBLE"].includes(left) && ["FLOAT", "DOUBLE"].includes(right)) return "DOUBLE";
  const leftDecimal = decimalParts(left);
  const rightDecimal = decimalParts(right);
  if ((leftDecimal || INTEGER_DIGITS[left]) && (rightDecimal || INTEGER_DIGITS[right]) && (leftDecimal || rightDecimal)) {
    const leftIntegral = leftDecimal ? leftDecimal.precision - leftDecimal.scale : INTEGER_DIGITS[left] ?? 0;
    const rightIntegral = rightDecimal ? rightDecimal.precision - rightDecimal.scale : INTEGER_DIGITS[right] ?? 0;
    const scale = Math.max(leftDecimal?.scale ?? 0, rightDecimal?.scale ?? 0);
    const precision = Math.max(leftIntegral, rightIntegral) + scale;
    return precision >= 1 && precision <= 38 ? `DECIMAL(${precision},${scale})` : null;
  }
  return null;
}

function decimalParts(type: string): { precision: number; scale: number } | null {
  const match = /^DECIMAL\((\d+),(\d+)\)$/.exec(type);
  return match ? { precision: Number(match[1]), scale: Number(match[2]) } : null;
}

function normalizeName(value: string): string {
  return value.toLocaleLowerCase("en-US");
}
