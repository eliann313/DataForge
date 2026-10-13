// API pública del módulo projects (E3.1). Los detalles internos no se
// importan desde otros módulos.
export type { Project } from "./domain/project";
export { validateProjectName, MAX_NAME_LENGTH } from "./domain/project";
export type { Folder } from "./domain/folder";
export { validateFolderName } from "./domain/folder";
export { ProjectError, type ProjectErrorCode } from "./domain/errors";
export type {
  ProjectRepository,
  FolderRepository,
} from "./application/ports";
export { ProjectsService, type ServiceDeps } from "./application/service";
export {
  MemoryProjectRepository,
  MemoryFolderRepository,
} from "./infrastructure/memory";
export {
  IndexedDBProjectRepository,
  IndexedDBFolderRepository,
} from "./infrastructure/indexeddb";
export { ProjectsProvider, useProjects } from "./presentation/ProjectsContext";
