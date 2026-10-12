// Casos de uso de projects (fase 1 / E3). Reglas:
// - Nombres no vacíos (≤100). Referencias (folderId/parentId) deben existir.
// - Sin ciclos en carpetas. Eliminar carpeta no vacía se bloquea (sin
//   pérdida silenciosa); la UI pedirá confirmación y reubicación previa.
// - Cada escritura del adaptador es una transacción (sin estados parciales
//   por operación). Entre comprobación y escritura no hay atomicidad
//   multi-entidad: supuesto monosesión documentado (multi-pestaña posterior).
import { ProjectError } from "../domain/errors";
import { validateFolderName, type Folder } from "../domain/folder";
import { validateProjectName, type Project } from "../domain/project";
import type { FolderRepository, ProjectRepository } from "./ports";

export interface ServiceDeps {
  projects: ProjectRepository;
  folders: FolderRepository;
  now?: () => string;
  generateId?: () => string;
}

export class ProjectsService {
  private readonly projects: ProjectRepository;
  private readonly folders: FolderRepository;
  private readonly now: () => string;
  private readonly generateId: () => string;

  constructor(deps: ServiceDeps) {
    this.projects = deps.projects;
    this.folders = deps.folders;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.generateId = deps.generateId ?? (() => crypto.randomUUID());
  }

  async createProject(input: {
    name: string;
    folderId?: string | null;
  }): Promise<Project> {
    const folderId = input.folderId ?? null;
    if (folderId !== null) await this.requireFolder(folderId);
    const timestamp = this.now();
    const project: Project = {
      id: this.generateId(),
      name: validateProjectName(input.name),
      folderId,
      kind: "general",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.projects.save(project);
    return project;
  }

  async renameProject(id: string, name: string): Promise<Project> {
    const current = await this.requireProject(id);
    const updated: Project = {
      ...current,
      name: validateProjectName(name),
      updatedAt: this.now(),
    };
    await this.projects.save(updated);
    return updated;
  }

  async moveProject(id: string, folderId: string | null): Promise<Project> {
    const current = await this.requireProject(id);
    if (folderId !== null) await this.requireFolder(folderId);
    const updated: Project = {
      ...current,
      folderId,
      updatedAt: this.now(),
    };
    await this.projects.save(updated);
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    await this.requireProject(id);
    await this.projects.delete(id);
  }

  getProject(id: string): Promise<Project> {
    return this.requireProject(id);
  }

  listProjects(query?: string): Promise<Project[]> {
    return this.projects.list(normalizeQuery(query));
  }

  listProjectsIn(folderId: string | null): Promise<Project[]> {
    return this.projects.listByFolder(folderId);
  }

  async createFolder(input: {
    name: string;
    parentId?: string | null;
  }): Promise<Folder> {
    const parentId = input.parentId ?? null;
    if (parentId !== null) await this.requireFolder(parentId);
    const timestamp = this.now();
    const folder: Folder = {
      id: this.generateId(),
      name: validateFolderName(input.name),
      parentId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.folders.save(folder);
    return folder;
  }

  async renameFolder(id: string, name: string): Promise<Folder> {
    const current = await this.requireFolder(id);
    const updated: Folder = {
      ...current,
      name: validateFolderName(name),
      updatedAt: this.now(),
    };
    await this.folders.save(updated);
    return updated;
  }

  async moveFolder(id: string, parentId: string | null): Promise<Folder> {
    const current = await this.requireFolder(id);
    if (parentId === id) {
      throw new ProjectError(
        "validation",
        "Una carpeta no puede contenerse a sí misma.",
      );
    }
    if (parentId !== null) {
      await this.requireFolder(parentId);
      if (await this.isDescendant(parentId, id)) {
        throw new ProjectError(
          "validation",
          "Una carpeta no puede moverse dentro de un descendiente.",
        );
      }
    }
    const updated: Folder = {
      ...current,
      parentId,
      updatedAt: this.now(),
    };
    await this.folders.save(updated);
    return updated;
  }

  async deleteFolder(id: string): Promise<void> {
    await this.requireFolder(id);
    const [projects, children] = await Promise.all([
      this.projects.listByFolder(id),
      this.folders.listByParent(id),
    ]);
    if (projects.length > 0 || children.length > 0) {
      throw new ProjectError(
        "folder-not-empty",
        "La carpeta no está vacía: reubique o elimine su contenido antes.",
      );
    }
    await this.folders.delete(id);
  }

  getFolder(id: string): Promise<Folder> {
    return this.requireFolder(id);
  }

  listFolders(query?: string): Promise<Folder[]> {
    return this.folders.list(normalizeQuery(query));
  }

  private async requireProject(id: string): Promise<Project> {
    const found = await this.projects.findById(id);
    if (!found) {
      throw new ProjectError("project-not-found", "Proyecto inexistente.");
    }
    return found;
  }

  private async requireFolder(id: string): Promise<Folder> {
    const found = await this.folders.findById(id);
    if (!found) {
      throw new ProjectError("folder-not-found", "Carpeta inexistente.");
    }
    return found;
  }

  /** ¿`candidate` desciende de `ancestor`? Camina padres hacia la raíz. */
  private async isDescendant(
    candidate: string,
    ancestor: string,
  ): Promise<boolean> {
    const seen = new Set<string>();
    let current: string | null = candidate;
    while (current !== null && !seen.has(current)) {
      if (current === ancestor) return true;
      seen.add(current);
      const folder = await this.folders.findById(current);
      current = folder ? folder.parentId : null;
    }
    return false;
  }
}

function normalizeQuery(query?: string): string | undefined {
  const q = query?.trim();
  return q ? q : undefined;
}
