import { ProjectError } from "./errors";
import { MAX_NAME_LENGTH } from "./project";

// Carpeta local. `parentId` null = raíz. La jerarquía es un árbol:
// una carpeta no puede colgarse de sí misma ni de un descendiente.
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function validateFolderName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) {
    throw new ProjectError("validation", "El nombre de la carpeta está vacío.");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ProjectError(
      "validation",
      `El nombre supera ${MAX_NAME_LENGTH} caracteres.`,
    );
  }
  return name;
}
