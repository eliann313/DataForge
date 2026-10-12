import {
  validatePipeline,
  type PipelineDefinition,
  type PipelinePreview,
  type PipelineVersion,
} from "../domain/definition";
import type { PipelineExecutionPort } from "./ports";

export class PipelineService {
  constructor(private readonly execution: PipelineExecutionPort) {}

  getVersions(): PipelineVersion[] {
    return this.execution.getDatasetVersions();
  }

  getActiveVersionId(): string | null {
    return this.execution.getActiveDatasetVersionId();
  }

  async getColumns(versionId: string) {
    return this.execution.getVersionColumns(versionId);
  }

  async preview(
    baseVersionId: string,
    definition: PipelineDefinition,
    limit = 20,
  ): Promise<PipelinePreview> {
    await this.validate(baseVersionId, definition);
    return this.execution.previewPipeline(baseVersionId, definition.steps, limit);
  }

  async execute(
    baseVersionId: string,
    definition: PipelineDefinition,
  ): Promise<PipelineVersion> {
    await this.validate(baseVersionId, definition);
    return this.execution.executePipeline(baseVersionId, definition);
  }

  activate(versionId: string): Promise<void> {
    return this.execution.activateDatasetVersion(versionId);
  }

  private async validate(baseVersionId: string, definition: PipelineDefinition): Promise<void> {
    const versions = this.execution.getDatasetVersions();
    if (!versions.some((version) => version.id === baseVersionId)) {
      throw new Error("La versión de origen ya no está disponible. Vuelva a Datos e importe el archivo.");
    }
    const validation = validatePipeline(
      await this.execution.getVersionColumns(baseVersionId),
      definition,
    );
    if (!validation.valid) throw new Error(validation.error ?? "El pipeline no es válido.");
  }
}
