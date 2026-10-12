import { ProjectError } from "./errors";

// Proyecto local (fase 1 / E3): solo metadatos. Los datasets por proyecto
// llegan con el módulo datasets (fase 2); el aislamiento de datos se
// verifica entonces. `kind` existe para no confundir el análisis libre
// con las plantillas especializadas posteriores (no habilitadas en R1).
export interface Project {
  id: string;
  name: string;
  /** null = raíz. Debe existir como carpeta si no es null. */
  folderId: string | null;
  kind: "general";
  createdAt: string;
  updatedAt: string;
}

export const MAX_NAME_LENGTH = 100;

export function validateProjectName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) {
    throw new ProjectError("validation", "El nombre del proyecto está vacío.");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ProjectError(
      "validation",
      `El nombre supera ${MAX_NAME_LENGTH} caracteres.`,
    );
  }
  return name;
}
