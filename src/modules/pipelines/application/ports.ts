import type {
  PipelineColumn,
  PipelineDefinition,
  PipelinePreview,
  PipelineStep,
  PipelineVersion,
} from "../domain/definition";

export type DatasetExportFormat = "csv" | "parquet";

export interface DatasetExport {
  fileName: string;
  mediaType: string;
  bytes: Uint8Array;
}

/** Puerto que ejecuta pasos declarativos y administra versiones locales. */
export interface PipelineExecutionPort {
  getDatasetVersions(): PipelineVersion[];
  getActiveDatasetVersionId(): string | null;
  getVersionColumns(versionId: string): Promise<PipelineColumn[]>;
  previewPipeline(
    baseVersionId: string,
    steps: PipelineStep[],
    limit: number,
  ): Promise<PipelinePreview>;
  executePipeline(
    baseVersionId: string,
    definition: PipelineDefinition,
  ): Promise<PipelineVersion>;
  activateDatasetVersion(versionId: string): Promise<void>;
  exportDatasetVersion(versionId: string, format: DatasetExportFormat): Promise<DatasetExport>;
}

/** Guarda definiciones declarativas por proyecto; no conserva archivos ni resultados. */
export interface PipelineDefinitionRepository {
  save(projectId: string, definition: PipelineDefinition): Promise<void>;
  list(projectId: string): Promise<PipelineDefinition[]>;
  delete(projectId: string, definitionId: string): Promise<void>;
}
