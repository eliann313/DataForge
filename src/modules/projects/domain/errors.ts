// Errores tipados del módulo projects (dominio, sin dependencias).
export type ProjectErrorCode =
  | "validation"
  | "project-not-found"
  | "folder-not-found"
  | "folder-not-empty"
  | "storage-unavailable"
  | "storage-failed"
  | "schema-too-new";

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  constructor(code: ProjectErrorCode, message: string) {
    super(message);
    this.name = "ProjectError";
    this.code = code;
  }
}
