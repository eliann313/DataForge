import {
  validateAppendDefinition,
  validateJoinDefinition,
  type AppendDefinition,
  type DatasetCombinationPreview,
  type JoinDefinition,
} from "../domain/combination";
import type { DatasetCombinationPort } from "./ports";
import type { PipelineVersion } from "@/modules/pipelines";

/** Valida esquema y alcance de proyecto antes de delegar la operación al motor. */
export class DatasetCombinationService {
  constructor(private readonly execution: DatasetCombinationPort) {}

  getVersions(): PipelineVersion[] {
    return this.execution.getDatasetVersions();
  }

  getColumns(versionId: string) {
    if (!this.execution.getDatasetVersions().some((version) => version.id === versionId)) {
      throw new Error("La versión seleccionada ya no está disponible en el proyecto activo.");
    }
    return this.execution.getVersionColumns(versionId);
  }

  async previewAppend(definition: AppendDefinition, limit = 20): Promise<DatasetCombinationPreview> {
    await this.validateAppend(definition);
    return this.execution.previewAppend(definition, limit);
  }

  async executeAppend(definition: AppendDefinition): Promise<PipelineVersion> {
    await this.validateAppend(definition);
    return this.execution.executeAppend(definition);
  }

  async previewJoin(definition: JoinDefinition, limit = 20): Promise<DatasetCombinationPreview> {
    await this.validateJoin(definition);
    return this.execution.previewJoin(definition, limit);
  }

  async executeJoin(definition: JoinDefinition): Promise<PipelineVersion> {
    await this.validateJoin(definition);
    return this.execution.executeJoin(definition);
  }

  private async versionsFor(leftId: string, rightId: string): Promise<[PipelineVersion, PipelineVersion]> {
    const versions = this.execution.getDatasetVersions();
    const left = versions.find((version) => version.id === leftId);
    const right = versions.find((version) => version.id === rightId);
    if (!left || !right) throw new Error("Seleccione dos versiones disponibles del proyecto activo.");
    if (left.id === right.id) throw new Error("Seleccione dos versiones distintas.");
    if (left.projectId !== right.projectId) throw new Error("No se pueden combinar versiones de proyectos distintos.");
    return [left, right];
  }

  private async validateAppend(definition: AppendDefinition): Promise<void> {
    const [left, right] = await this.versionsFor(definition.leftVersionId, definition.rightVersionId);
    const [leftColumns, rightColumns] = await Promise.all([
      this.execution.getVersionColumns(left.id),
      this.execution.getVersionColumns(right.id),
    ]);
    const validation = validateAppendDefinition(leftColumns, rightColumns, definition);
    if (!validation.valid) throw new Error(validation.error ?? "El mapeo APPEND no es válido.");
  }

  private async validateJoin(definition: JoinDefinition): Promise<void> {
    const [left, right] = await this.versionsFor(definition.leftVersionId, definition.rightVersionId);
    const [leftColumns, rightColumns] = await Promise.all([
      this.execution.getVersionColumns(left.id),
      this.execution.getVersionColumns(right.id),
    ]);
    const validation = validateJoinDefinition(leftColumns, rightColumns, definition);
    if (!validation.valid) throw new Error(validation.error ?? "La definición del JOIN no es válida.");
  }
}
