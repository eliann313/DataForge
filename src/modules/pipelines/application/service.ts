import {
  validatePipeline,
  type PipelineDefinition,
  type PipelinePreview,
  type PipelineVersion,
} from "../domain/definition";
import type { PipelineDefinitionRepository, PipelineExecutionPort } from "./ports";

export class PipelineService {
  constructor(
    private readonly execution: PipelineExecutionPort,
    private readonly definitions: PipelineDefinitionRepository,
  ) {}

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

  listDefinitions(projectId: string): Promise<PipelineDefinition[]> {
    return this.definitions.list(projectId);
  }

  async saveDefinition(
    projectId: string,
    baseVersionId: string,
    definition: PipelineDefinition,
  ): Promise<PipelineDefinition> {
    await this.validate(baseVersionId, definition);
    await this.definitions.save(projectId, definition);
    return { ...definition, steps: definition.steps.map((step) => ({ ...step })) };
  }

  async validateDefinition(baseVersionId: string, definition: PipelineDefinition): Promise<void> {
    await this.validate(baseVersionId, definition);
  }

  deleteDefinition(projectId: string, definitionId: string): Promise<void> {
    return this.definitions.delete(projectId, definitionId);
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
