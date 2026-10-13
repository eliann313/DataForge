export interface DatasetColumn {
  name: string;
  type: string;
  nullable: boolean;
}

/** Fuente importada inmutable disponible mientras vive la sesión del Worker. */
export interface DatasetSource {
  id: string;
  projectId: string | null;
  name: string;
  rowCount: number;
  columns: DatasetColumn[];
  bytes: number;
  durationMs: number;
  createdAt: string;
}
