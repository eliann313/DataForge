// Puertos del módulo projects: los casos de uso los declaran,
// los adaptadores (IndexedDB, memoria) los implementan.
import type { Folder } from "../domain/folder";
import type { Project } from "../domain/project";

export interface ProjectRepository {
  save(project: Project): Promise<void>;
  findById(id: string): Promise<Project | null>;
  /** Búsqueda por nombre (subcadena, insensible a mayúsculas). */
  list(query?: string): Promise<Project[]>;
  listByFolder(folderId: string | null): Promise<Project[]>;
  delete(id: string): Promise<void>;
}

export interface FolderRepository {
  save(folder: Folder): Promise<void>;
  findById(id: string): Promise<Folder | null>;
  list(query?: string): Promise<Folder[]>;
  listByParent(parentId: string | null): Promise<Folder[]>;
  delete(id: string): Promise<void>;
}
