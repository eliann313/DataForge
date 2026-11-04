export type PipelineFilterOperator =
  | "contains"
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "isnull"
  | "notnull";

export interface PipelineFilter {
  column: string;
  op: PipelineFilterOperator;
  value?: string;
}

export type PipelineTargetType = "INTEGER" | "BIGINT" | "DECIMAL" | "BOOLEAN" | "VARCHAR";
export type PipelineArithmeticOperator = "add" | "subtract" | "multiply";
export type PipelineAggregate =
  | { operator: "count"; outputName: string }
  | { operator: "sum" | "min" | "max"; column: string; outputName: string };
export type PipelineDateFormat =
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD-MM-YYYY"
  | "YYYY-MM-DD HH:mm:ss";

export type PipelineStep =
  | { id: string; type: "filter"; filter: PipelineFilter }
  | { id: string; type: "select"; columns: string[] }
  | { id: string; type: "dropNulls"; columns: string[] }
  | { id: string; type: "fillNull"; column: string; value: string | null }
  | {
      id: string;
      type: "convertType";
      column: string;
      targetType: PipelineTargetType;
      precision: number;
      scale: number;
    }
  | { id: string; type: "normalizeDate"; column: string; inputFormat: PipelineDateFormat }
  | {
      id: string;
      type: "calculate";
      leftColumn: string;
      operator: PipelineArithmeticOperator;
      rightColumn: string;
      outputName: string;
    }
  | { id: string; type: "aggregate"; groupBy: string[]; aggregations: PipelineAggregate[] }
  | {
      id: string;
      type: "normalizeText";
      column: string;
      trimWhitespace: boolean;
      letterCase: "preserve" | "lower" | "upper";
      emptyToNull: boolean;
    }
  | { id: string; type: "rename"; column: string; newName: string }
  | { id: string; type: "deduplicate" }
  | { id: string; type: "sort"; column: string; direction: "asc" | "desc" };

export interface PipelineDefinition {
  id: string;
  name: string;
  steps: PipelineStep[];
}

/** Valida la forma persistida antes de tratarla como una definición confiable. */
export function isPipelineDefinition(value: unknown): value is PipelineDefinition {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || !Array.isArray(value.steps)) {
    return false;
  }
  return value.steps.every((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string") return false;
    switch (candidate.type) {
      case "filter":
        return isRecord(candidate.filter) && typeof candidate.filter.column === "string" &&
          typeof candidate.filter.op === "string" && FILTER_OPERATORS.has(candidate.filter.op as PipelineFilterOperator) &&
          (candidate.filter.value === undefined || typeof candidate.filter.value === "string");
      case "select":
      case "dropNulls":
        return Array.isArray(candidate.columns) && candidate.columns.every((column) => typeof column === "string");
      case "fillNull":
        return typeof candidate.column === "string" && (candidate.value === null || typeof candidate.value === "string");
      case "convertType":
        return typeof candidate.column === "string" && PIPELINE_TARGET_TYPES.has(candidate.targetType as PipelineTargetType) &&
          typeof candidate.precision === "number" && typeof candidate.scale === "number";
      case "normalizeDate":
        return typeof candidate.column === "string" && PIPELINE_DATE_FORMATS.has(candidate.inputFormat as PipelineDateFormat);
      case "calculate":
        return typeof candidate.leftColumn === "string" &&
          PIPELINE_ARITHMETIC_OPERATORS.has(candidate.operator as PipelineArithmeticOperator) &&
          typeof candidate.rightColumn === "string" && typeof candidate.outputName === "string";
      case "aggregate":
        return Array.isArray(candidate.groupBy) && candidate.groupBy.every((column) => typeof column === "string") &&
          Array.isArray(candidate.aggregations) && candidate.aggregations.every(isPipelineAggregate);
      case "normalizeText":
        return typeof candidate.column === "string" && typeof candidate.trimWhitespace === "boolean" &&
          (candidate.letterCase === "preserve" || candidate.letterCase === "lower" || candidate.letterCase === "upper") &&
          typeof candidate.emptyToNull === "boolean";
      case "rename":
        return typeof candidate.column === "string" && typeof candidate.newName === "string";
      case "deduplicate":
        return true;
      case "sort":
        return typeof candidate.column === "string" && (candidate.direction === "asc" || candidate.direction === "desc");
      default:
        return false;
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPipelineAggregate(value: unknown): value is PipelineAggregate {
  if (!isRecord(value) || typeof value.outputName !== "string") return false;
  if (value.operator === "count") return true;
  return (value.operator === "sum" || value.operator === "min" || value.operator === "max") &&
    typeof value.column === "string";
}

export interface PipelineColumn {
  name: string;
  type: string;
  nullable: boolean;
}

/** Clasifica tipos físicos numéricos para no reinterpretar textos numéricos. */
export function isNumericPipelineColumn(column: PipelineColumn): boolean {
  return /^(?:UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|INT2|INT4|INT8|FLOAT|FLOAT4|FLOAT8|REAL|DOUBLE|DECIMAL|NUMERIC)(?:\s*\(|$)/.test(
    column.type.trim().toUpperCase(),
  );
}

/** Solo transforma tipos textuales explícitos; no convierte otros tipos a texto. */
export function isTextPipelineColumn(column: PipelineColumn): boolean {
  return /^(?:VARCHAR|TEXT|STRING|CHAR|BPCHAR)(?:\s*\(|$)/.test(
    column.type.trim().toUpperCase(),
  );
}

/** Tipos DATE/TIMESTAMP que se pueden reducir sin interpretar una zona horaria. */
export function isDatePipelineColumn(column: PipelineColumn): boolean {
  return /^(?:DATE|DATETIME|TIMESTAMP(?:_(?:S|MS|NS))?)$/.test(
    column.type.trim().toUpperCase(),
  );
}

export function isNumericPipelineValue(value: string): boolean {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim());
}

/** Referencia lógica a la fuente o a una versión derivada durante la sesión. */
export interface PipelineVersion {
  id: string;
  /** Fuente principal para compatibilidad con versiones anteriores del contrato. */
  sourceId: string;
  /** Todas las fuentes originales que intervienen en esta versión. */
  sourceIds: string[];
  projectId: string | null;
  name: string;
  /** Padre principal para compatibilidad con la navegación de versiones. */
  parentId: string | null;
  /** Todos los padres inmediatos; permite representar APPEND y JOIN. */
  parentIds: string[];
  operationType: "source" | "pipeline" | "append" | "join";
  pipelineId: string | null;
  rowCount: number;
  columns: PipelineColumn[];
  stepCount: number;
  createdAt: string;
}

export interface PipelinePreview {
  inputRowCount: number;
  outputRowCount: number;
  columns: PipelineColumn[];
  rows: Record<string, unknown>[];
}

export interface PipelineValidation {
  valid: boolean;
  columns: PipelineColumn[];
  error: string | null;
  stepId: string | null;
}

export const MAX_PIPELINE_STEPS = 50;

const FILTER_OPERATORS = new Set<PipelineFilterOperator>([
  "contains", "eq", "gt", "gte", "lt", "lte", "isnull", "notnull",
]);
const FILTER_OPERATORS_REQUIRING_VALUE = new Set<PipelineFilterOperator>([
  "contains", "eq", "gt", "gte", "lt", "lte",
]);
const PIPELINE_TARGET_TYPES = new Set<PipelineTargetType>([
  "INTEGER", "BIGINT", "DECIMAL", "BOOLEAN", "VARCHAR",
]);
const PIPELINE_ARITHMETIC_OPERATORS = new Set<PipelineArithmeticOperator>([
  "add", "subtract", "multiply",
]);
const PIPELINE_DATE_FORMATS = new Set<PipelineDateFormat>([
  "YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY", "YYYY-MM-DD HH:mm:ss",
]);

/**
 * Valida pasos cerrados contra el esquema que va produciendo cada paso.
 * No acepta SQL ni nombres de tabla del usuario.
 */
export function validatePipeline(
  sourceColumns: readonly PipelineColumn[],
  definition: PipelineDefinition,
): PipelineValidation {
  let columns = sourceColumns.map((column) => ({ ...column }));
  const ids = new Set<string>();
  let sortSeen = false;

  const fail = (error: string, stepId: string | null = null): PipelineValidation => ({
    valid: false,
    columns,
    error,
    stepId,
  });

  if (!definition.name.trim()) return fail("Ingrese un nombre para el pipeline.");
  if (!definition.id.trim()) return fail("La definición necesita un identificador.");
  if (definition.name.trim().length > 80) {
    return fail("El nombre del pipeline no puede superar los 80 caracteres.");
  }
  if (definition.steps.length === 0) {
    return fail("Agregue al menos un paso antes de previsualizar o ejecutar.");
  }
  if (definition.steps.length > MAX_PIPELINE_STEPS) {
    return fail(`El pipeline no puede superar los ${MAX_PIPELINE_STEPS} pasos.`);
  }

  for (const [stepIndex, step] of definition.steps.entries()) {
    if (!step.id || ids.has(step.id)) {
      return fail("Cada paso necesita un identificador único.", step.id || null);
    }
    ids.add(step.id);

    switch (step.type) {
      case "filter": {
        if (!FILTER_OPERATORS.has(step.filter.op)) {
          return fail("El operador del filtro no es válido.", step.id);
        }
        if (!hasColumn(columns, step.filter.column)) {
          return fail(`El filtro referencia una columna que ya no existe: ${step.filter.column}.`, step.id);
        }
        if (needsFilterValue(step.filter.op) && step.filter.value === "") {
          return fail("Complete el valor del filtro.", step.id);
        }
        const filterColumn = findColumn(columns, step.filter.column)!;
        if (isNumericPipelineColumn(filterColumn) && needsFilterValue(step.filter.op) && !isNumericPipelineValue(step.filter.value ?? "")) {
          return fail(`Ingrese un valor numérico válido para ${filterColumn.name}.`, step.id);
        }
        if (isNumericComparison(step.filter.op) && !isNumericPipelineColumn(filterColumn)) {
          return fail(`Los filtros de comparación requieren una columna numérica: ${filterColumn.name}.`, step.id);
        }
        break;
      }
      case "select": {
        if (step.columns.length === 0) {
          return fail("Seleccione al menos una columna para conservar.", step.id);
        }
        const normalized = step.columns.map(normalizeName);
        if (new Set(normalized).size !== normalized.length) {
          return fail("La selección contiene columnas repetidas.", step.id);
        }
        const missing = step.columns.find((name) => !hasColumn(columns, name));
        if (missing) return fail(`La selección referencia una columna que ya no existe: ${missing}.`, step.id);
        columns = step.columns.map((name) => ({ ...findColumn(columns, name)! }));
        break;
      }
      case "dropNulls": {
        if (step.columns.length === 0) {
          return fail("Seleccione al menos una columna para revisar nulos.", step.id);
        }
        const normalized = step.columns.map(normalizeName);
        if (new Set(normalized).size !== normalized.length) {
          return fail("La selección de columnas para nulos contiene repetidas.", step.id);
        }
        const missing = step.columns.find((name) => !hasColumn(columns, name));
        if (missing) return fail(`La selección de nulos referencia una columna que ya no existe: ${missing}.`, step.id);
        break;
      }
      case "fillNull": {
        const column = findColumn(columns, step.column);
        if (!column) {
          return fail(`No se puede reemplazar nulos en una columna que ya no existe: ${step.column}.`, step.id);
        }
        if (step.value === null) {
          return fail("Ingrese el valor para reemplazar los nulos.", step.id);
        }
        if (isNumericPipelineColumn(column) && !isNumericPipelineValue(step.value)) {
          return fail(`Ingrese un valor numérico válido para ${column.name}.`, step.id);
        }
        break;
      }
      case "convertType": {
        const column = findColumn(columns, step.column);
        if (!column) {
          return fail(`No se puede convertir una columna que ya no existe: ${step.column}.`, step.id);
        }
        if (!PIPELINE_TARGET_TYPES.has(step.targetType)) {
          return fail("El tipo de destino no es válido.", step.id);
        }
        if (
          step.targetType === "DECIMAL" &&
          (!Number.isInteger(step.precision) || step.precision < 1 || step.precision > 38 ||
            !Number.isInteger(step.scale) || step.scale < 0 || step.scale > step.precision)
        ) {
          return fail("La precisión debe estar entre 1 y 38 y la escala entre 0 y la precisión.", step.id);
        }
        const type = step.targetType === "DECIMAL"
          ? `DECIMAL(${step.precision},${step.scale})`
          : step.targetType;
        columns = columns.map((candidate) =>
          candidate.name === column.name ? { ...candidate, type } : candidate,
        );
        break;
      }
      case "normalizeDate": {
        const column = findColumn(columns, step.column);
        if (!column) {
          return fail(`No se puede normalizar una columna que ya no existe: ${step.column}.`, step.id);
        }
        if (!isTextPipelineColumn(column) && !isDatePipelineColumn(column)) {
          return fail(`La normalización de fechas requiere texto, DATE o TIMESTAMP sin zona horaria: ${column.name}.`, step.id);
        }
        if (!PIPELINE_DATE_FORMATS.has(step.inputFormat)) {
          return fail("El formato de fecha no es válido.", step.id);
        }
        columns = columns.map((candidate) =>
          candidate.name === column.name ? { ...candidate, type: "DATE" } : candidate,
        );
        break;
      }
      case "calculate": {
        const left = findColumn(columns, step.leftColumn);
        const right = findColumn(columns, step.rightColumn);
        if (!left || !right) {
          const missing = !left ? step.leftColumn : step.rightColumn;
          return fail(`El cálculo referencia una columna que ya no existe: ${missing}.`, step.id);
        }
        if (!isNumericPipelineColumn(left) || !isNumericPipelineColumn(right)) {
          return fail("Los cálculos requieren dos columnas numéricas.", step.id);
        }
        if (!PIPELINE_ARITHMETIC_OPERATORS.has(step.operator)) {
          return fail("La operación del cálculo no es válida.", step.id);
        }
        const outputName = step.outputName.trim();
        if (!outputName || outputName.includes("\0")) {
          return fail("Ingrese un nombre válido para la columna calculada.", step.id);
        }
        if (outputName.length > 128) {
          return fail("El nombre de columna no puede superar los 128 caracteres.", step.id);
        }
        if (columns.some((column) => normalizeName(column.name) === normalizeName(outputName))) {
          return fail(`Ya existe una columna llamada «${outputName}».`, step.id);
        }
        const resultType = arithmeticResultType(left, right, step.operator);
        if (!resultType) {
          return fail("El resultado supera la precisión decimal admitida o mezcla DECIMAL con coma flotante.", step.id);
        }
        columns = [...columns, {
          name: outputName,
          type: resultType,
          nullable: left.nullable || right.nullable,
        }];
        break;
      }
      case "aggregate": {
        if (step.groupBy.some((name, index) => step.groupBy.slice(0, index).some((other) => normalizeName(other) === normalizeName(name)))) {
          return fail("La agrupación contiene columnas repetidas.", step.id);
        }
        const missingGroupColumn = step.groupBy.find((name) => !hasColumn(columns, name));
        if (missingGroupColumn) {
          return fail(`La agrupación referencia una columna que ya no existe: ${missingGroupColumn}.`, step.id);
        }
        if (step.aggregations.length === 0) {
          return fail("Agregue al menos una operación de agregación.", step.id);
        }

        const outputNames = new Set(step.groupBy.map(normalizeName));
        const aggregateColumns: PipelineColumn[] = [];
        for (const aggregation of step.aggregations) {
          const outputName = aggregation.outputName.trim();
          if (!outputName || outputName.includes("\0")) {
            return fail("Ingrese un nombre válido para cada resultado de agregación.", step.id);
          }
          if (outputName.length > 128) {
            return fail("El nombre de columna no puede superar los 128 caracteres.", step.id);
          }
          const normalizedOutput = normalizeName(outputName);
          if (outputNames.has(normalizedOutput)) {
            return fail(`Ya existe una columna llamada «${outputName}».`, step.id);
          }
          outputNames.add(normalizedOutput);

          if (aggregation.operator === "count") {
            aggregateColumns.push({ name: outputName, type: "BIGINT", nullable: false });
            continue;
          }
          const source = findColumn(columns, aggregation.column);
          if (!source) {
            return fail(`La agregación referencia una columna que ya no existe: ${aggregation.column}.`, step.id);
          }
          if (!isNumericPipelineColumn(source)) {
            return fail("La suma, el mínimo y el máximo requieren una columna numérica.", step.id);
          }
          const resultType = aggregation.operator === "sum"
            ? sumResultType(source)
            : source.type.trim().toUpperCase();
          if (!resultType) {
            return fail("No se puede sumar esta columna sin exceder la precisión numérica admitida.", step.id);
          }
          aggregateColumns.push({
            name: outputName,
            type: resultType,
            nullable: true,
          });
        }
        columns = [
          ...step.groupBy.map((name) => ({ ...findColumn(columns, name)! })),
          ...aggregateColumns,
        ];
        break;
      }
      case "normalizeText": {
        const column = findColumn(columns, step.column);
        if (!column) {
          return fail(`No se puede normalizar una columna que ya no existe: ${step.column}.`, step.id);
        }
        if (!isTextPipelineColumn(column)) {
          return fail(`La normalización requiere una columna de texto: ${column.name}.`, step.id);
        }
        if (step.letterCase !== "preserve" && step.letterCase !== "lower" && step.letterCase !== "upper") {
          return fail("La opción de mayúsculas y minúsculas no es válida.", step.id);
        }
        if (typeof step.trimWhitespace !== "boolean" || typeof step.emptyToNull !== "boolean") {
          return fail("Las opciones de normalización de texto no son válidas.", step.id);
        }
        if (!step.trimWhitespace && step.letterCase === "preserve" && !step.emptyToNull) {
          return fail("Elija al menos una regla para normalizar el texto.", step.id);
        }
        if (step.emptyToNull) {
          columns = columns.map((candidate) =>
            candidate.name === column.name ? { ...candidate, nullable: true } : candidate,
          );
        }
        break;
      }
      case "rename": {
        const current = findColumn(columns, step.column);
        if (!current) {
          return fail(`No se puede renombrar una columna que ya no existe: ${step.column}.`, step.id);
        }
        const newName = step.newName.trim();
        if (!newName || newName.includes("\0")) {
          return fail("El nombre nuevo de columna está vacío o no es válido.", step.id);
        }
        if (newName.length > 128) {
          return fail("El nombre de columna no puede superar los 128 caracteres.", step.id);
        }
        const conflict = columns.find(
          (column) => normalizeName(column.name) === normalizeName(newName) && column.name !== current.name,
        );
        if (conflict) return fail(`Ya existe una columna llamada «${newName}».`, step.id);
        columns = columns.map((column) =>
          column.name === current.name ? { ...column, name: newName } : column,
        );
        break;
      }
      case "deduplicate":
        break;
      case "sort":
        if (sortSeen || stepIndex !== definition.steps.length - 1) {
          return fail("El paso de orden debe aparecer una sola vez y ser el último.", step.id);
        }
        if (!hasColumn(columns, step.column)) {
          return fail(`El orden referencia una columna que ya no existe: ${step.column}.`, step.id);
        }
        if (step.direction !== "asc" && step.direction !== "desc") {
          return fail("La dirección de orden no es válida.", step.id);
        }
        sortSeen = true;
        break;
    }
  }

  return { valid: true, columns, error: null, stepId: null };
}

/** Esquema disponible al editar el paso ubicado en `index`. */
export function columnsBeforeStep(
  sourceColumns: readonly PipelineColumn[],
  definition: PipelineDefinition,
  index: number,
): PipelineColumn[] {
  const partial = validatePipeline(sourceColumns, {
    ...definition,
    steps: definition.steps.slice(0, index),
  });
  return partial.columns;
}

function findColumn(columns: readonly PipelineColumn[], name: string): PipelineColumn | undefined {
  return columns.find((column) => column.name === name);
}

function hasColumn(columns: readonly PipelineColumn[], name: string): boolean {
  return findColumn(columns, name) !== undefined;
}

function needsFilterValue(operator: PipelineFilterOperator): boolean {
  return FILTER_OPERATORS_REQUIRING_VALUE.has(operator);
}

function isNumericComparison(operator: PipelineFilterOperator): boolean {
  return operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte";
}

function normalizeName(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

/** Devuelve un tipo de salida exacto cuando las entradas lo permiten. */
function arithmeticResultType(
  left: PipelineColumn,
  right: PipelineColumn,
  operator: PipelineArithmeticOperator,
): string | null {
  const leftType = left.type.trim().toUpperCase();
  const rightType = right.type.trim().toUpperCase();
  const leftFloat = /^(?:FLOAT|FLOAT4|FLOAT8|REAL|DOUBLE)(?:\s*\(|$)/.test(leftType);
  const rightFloat = /^(?:FLOAT|FLOAT4|FLOAT8|REAL|DOUBLE)(?:\s*\(|$)/.test(rightType);
  const leftDecimal = decimalParts(leftType);
  const rightDecimal = decimalParts(rightType);
  if ((leftFloat || rightFloat) && (leftDecimal || rightDecimal)) return null;
  if (leftFloat || rightFloat) return "DOUBLE";

  const leftParts = leftDecimal ?? integerParts(leftType);
  const rightParts = rightDecimal ?? integerParts(rightType);
  if (!leftParts || !rightParts) return null;
  if (!leftDecimal && !rightDecimal) return "HUGEINT";

  const scale = operator === "multiply"
    ? leftParts.scale + rightParts.scale
    : Math.max(leftParts.scale, rightParts.scale);
  const integerDigits = operator === "multiply"
    ? leftParts.precision - leftParts.scale + rightParts.precision - rightParts.scale + 1
    : Math.max(leftParts.precision - leftParts.scale, rightParts.precision - rightParts.scale) + 1;
  const precision = integerDigits + scale;
  return precision <= 38 ? `DECIMAL(${precision},${scale})` : null;
}

function sumResultType(column: PipelineColumn): string | null {
  const type = column.type.trim().toUpperCase();
  if (/^(?:FLOAT|FLOAT4|FLOAT8|REAL|DOUBLE)(?:\s*\(|$)/.test(type)) return "DOUBLE";
  const decimal = decimalParts(type);
  if (decimal) return `DECIMAL(38,${decimal.scale})`;
  return integerParts(type) ? "HUGEINT" : null;
}

function decimalParts(type: string): { precision: number; scale: number } | null {
  const match = /^(?:DECIMAL|NUMERIC)\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(type);
  if (!match) return null;
  const precision = Number(match[1]);
  const scale = Number(match[2]);
  return Number.isInteger(precision) && Number.isInteger(scale) &&
    precision >= 1 && precision <= 38 && scale >= 0 && scale <= precision
    ? { precision, scale }
    : null;
}

function integerParts(type: string): { precision: number; scale: 0 } | null {
  const digits: Record<string, number> = {
    UTINYINT: 3, TINYINT: 3, INT1: 3,
    USMALLINT: 5, SMALLINT: 5, INT2: 5,
    UINTEGER: 10, INTEGER: 10, INT: 10, INT4: 10,
    UBIGINT: 20, BIGINT: 19, INT8: 19,
    HUGEINT: 38,
  };
  const precision = digits[type];
  return precision ? { precision, scale: 0 } : null;
}
