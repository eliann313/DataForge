export type ReportSectionKind =
  | "snapshot"
  | "observations"
  | "conclusions"
  | "methodology"
  | "limitations";

export interface ReportSection {
  id: string;
  kind: ReportSectionKind;
  title: string;
  /** Snapshot sections use snapshotId. Editorial sections use plain text content. */
  snapshotId?: string;
  content?: string;
}

export interface Report {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sections: ReportSection[];
}

const SECTION_KINDS = new Set<ReportSectionKind>([
  "snapshot", "observations", "conclusions", "methodology", "limitations",
]);

export function isReport(value: unknown): value is Report {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<Report>;
  return typeof report.id === "string" && report.id.length > 0
    && typeof report.projectId === "string" && report.projectId.length > 0
    && typeof report.title === "string" && report.title.length > 0
    && typeof report.createdAt === "string" && Number.isFinite(Date.parse(report.createdAt))
    && typeof report.updatedAt === "string" && Number.isFinite(Date.parse(report.updatedAt))
    && Array.isArray(report.sections)
    && report.sections.every((section) => Boolean(section)
      && typeof section.id === "string" && section.id.length > 0
      && typeof section.title === "string"
      && SECTION_KINDS.has(section.kind)
      && (section.kind === "snapshot"
        ? typeof section.snapshotId === "string" && section.snapshotId.length > 0
        : typeof section.content === "string"));
}

export function createReport(projectId: string, title: string, now = new Date().toISOString()): Report {
  const normalizedTitle = title.trim();
  if (!projectId.trim()) throw new Error("Abra un proyecto para crear un informe.");
  if (!normalizedTitle) throw new Error("El informe necesita un título.");
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id: `report-${id}`, projectId, title: normalizedTitle, createdAt: now, updatedAt: now, sections: [] };
}

export function updateReport(report: Report, changes: Pick<Report, "title" | "sections">, now = new Date().toISOString()): Report {
  const title = changes.title.trim();
  if (!title) throw new Error("El informe necesita un título.");
  const updated = { ...report, title, sections: changes.sections.map((section) => ({ ...section })), updatedAt: now };
  if (!isReport(updated)) throw new Error("La estructura del informe no es válida.");
  return updated;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export interface ReportSnapshotView {
  id: string;
  title: string;
  createdAt: string;
  source: { datasetName: string; rowCount: number; versionId: string; columns: Array<{ name: string; type: string }> };
  parameters: Record<string, unknown>;
  results: Record<string, unknown>;
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

/** Renders standalone HTML. All user and dataset text is escaped as text, never interpreted as markup. */
export function renderReportHtml(report: Report, snapshots: ReadonlyMap<string, ReportSnapshotView>): string {
  const sections = report.sections.map((section) => {
    if (section.kind !== "snapshot") {
      return `<section><h2>${escapeHtml(section.title)}</h2><pre>${escapeHtml(section.content ?? "")}</pre></section>`;
    }
    const snapshot = snapshots.get(section.snapshotId ?? "");
    if (!snapshot) {
      return `<section><h2>${escapeHtml(section.title)}</h2><p>El snapshot referenciado no está disponible en este proyecto.</p></section>`;
    }
    const source = snapshot.source;
    return `<section><h2>${escapeHtml(section.title)}</h2><p><strong>Snapshot:</strong> ${escapeHtml(snapshot.title)} · ${escapeHtml(snapshot.createdAt)}</p><p><strong>Dataset:</strong> ${escapeHtml(source.datasetName)} · ${source.rowCount} filas · versión ${escapeHtml(source.versionId)}</p><h3>Columnas</h3><pre>${escapeHtml(pretty(source.columns))}</pre><h3>Parámetros</h3><pre>${escapeHtml(pretty(snapshot.parameters))}</pre><h3>Resultados guardados</h3><pre>${escapeHtml(pretty(snapshot.results))}</pre></section>`;
  }).join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#172033}h1{border-bottom:1px solid #ddd;padding-bottom:.5rem}section{margin:2rem 0;break-inside:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f8;padding:1rem;border-radius:.5rem}button{padding:.5rem 1rem}@media print{button{display:none}body{margin:0}}</style></head><body><button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button><h1>${escapeHtml(report.title)}</h1><p>Informe local · actualizado ${escapeHtml(report.updatedAt)}</p>${sections}</body></html>`;
}
