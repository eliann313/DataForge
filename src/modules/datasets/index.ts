// Contratos públicos de datasets. La fuente y sus versiones viven en el
// Worker durante la sesión; este módulo no persiste los bytes importados.
export type { DatasetColumn, DatasetSource } from "./domain/source";
export {
  safeSqlType,
  validateAppendDefinition,
  validateJoinDefinition,
  type AppendColumnMapping,
  type AppendDefinition,
  type CombinationValidation,
  type DatasetCombinationPreview,
  type DatasetJoinCardinality,
  type DatasetJoinType,
  type JoinDefinition,
  type JoinKeyMapping,
  type JoinOutputColumn,
} from "./domain/combination";
export { DatasetCombinationService } from "./application/service";
export type { DatasetCombinationPort } from "./application/ports";
