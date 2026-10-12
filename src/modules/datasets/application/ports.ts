import type { PipelineVersion } from "@/modules/pipelines";
import type {
  AppendDefinition,
  DatasetCombinationPreview,
  JoinDefinition,
} from "../domain/combination";
import type { DatasetColumn } from "../domain/source";

/** Puerto de sesión para componer versiones que pertenecen al proyecto activo. */
export interface DatasetCombinationPort {
  getDatasetVersions(): PipelineVersion[];
  getVersionColumns(versionId: string): Promise<DatasetColumn[]>;
  previewAppend(definition: AppendDefinition, limit: number): Promise<DatasetCombinationPreview>;
  executeAppend(definition: AppendDefinition): Promise<PipelineVersion>;
  previewJoin(definition: JoinDefinition, limit: number): Promise<DatasetCombinationPreview>;
  executeJoin(definition: JoinDefinition): Promise<PipelineVersion>;
}
