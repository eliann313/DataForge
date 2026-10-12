import type { PipelineDefinition } from "../domain/definition";
import type { PipelineDefinitionRepository } from "../application/ports";

/** Adaptador en memoria para casos de uso y pruebas. */
export class MemoryPipelineDefinitionRepository implements PipelineDefinitionRepository {
  private readonly records = new Map<string, PipelineDefinition>();

  async save(projectId: string, definition: PipelineDefinition): Promise<void> {
    this.records.set(this.key(projectId, definition.id), clone(definition));
  }

  async list(projectId: string): Promise<PipelineDefinition[]> {
    return [...this.records.entries()]
      .filter(([key]) => key.startsWith(`${projectId}\0`))
      .map(([, definition]) => clone(definition))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async delete(projectId: string, definitionId: string): Promise<void> {
    this.records.delete(this.key(projectId, definitionId));
  }

  private key(projectId: string, definitionId: string): string {
    return `${projectId}\0${definitionId}`;
  }
}

function clone(definition: PipelineDefinition): PipelineDefinition {
  return JSON.parse(JSON.stringify(definition)) as PipelineDefinition;
}
