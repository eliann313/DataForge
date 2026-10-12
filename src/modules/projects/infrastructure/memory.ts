// Repositorios en memoria (infraestructura de prueba y desarrollo).
// Misma semántica de puertos que el adaptador IndexedDB.
import type { Folder } from "../domain/folder";
import type { Project } from "../domain/project";
import type { FolderRepository, ProjectRepository } from "../application/ports";

export function matchesQuery(name: string, query?: string): boolean {
  if (!query) return true;
  return name.toLowerCase().includes(query.toLowerCase());
}

export class MemoryProjectRepository implements ProjectRepository {
  private readonly store = new Map<string, Project>();

  async save(project: Project): Promise<void> {
    this.store.set(project.id, { ...project });
  }

  async findById(id: string): Promise<Project | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async list(query?: string): Promise<Project[]> {
    return [...this.store.values()]
      .filter((p) => matchesQuery(p.name, query))
      .map((p) => ({ ...p }));
  }

  async listByFolder(folderId: string | null): Promise<Project[]> {
    return [...this.store.values()]
      .filter((p) => p.folderId === folderId)
      .map((p) => ({ ...p }));
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class MemoryFolderRepository implements FolderRepository {
  private readonly store = new Map<string, Folder>();

  async save(folder: Folder): Promise<void> {
    this.store.set(folder.id, { ...folder });
  }

  async findById(id: string): Promise<Folder | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async list(query?: string): Promise<Folder[]> {
    return [...this.store.values()]
      .filter((f) => matchesQuery(f.name, query))
      .map((f) => ({ ...f }));
  }

  async listByParent(parentId: string | null): Promise<Folder[]> {
    return [...this.store.values()]
      .filter((f) => f.parentId === parentId)
      .map((f) => ({ ...f }));
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
