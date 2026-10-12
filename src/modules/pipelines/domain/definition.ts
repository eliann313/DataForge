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

export type PipelineStep =
  | { id: string; type: "filter"; filter: PipelineFilter }
  | { id: string; type: "select"; columns: string[] }
  | { id: string; type: "dropNulls"; columns: string[] }
  | { id: string; type: "rename"; column: string; newName: string }
  | { id: string; type: "deduplicate" }
  | { id: string; type: "sort"; column: string; direction: "asc" | "desc" };

export interface PipelineDefinition {
  id: string;
  name: string;
  steps: PipelineStep[];
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

/** Referencia lógica a la fuente o a una versión derivada durante la sesión. */
export interface PipelineVersion {
  id: string;
  name: string;
  parentId: string | null;
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

function normalizeName(value: string): string {
  return value.toLocaleLowerCase("en-US");
}
