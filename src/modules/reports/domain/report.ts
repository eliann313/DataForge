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
export const MAX_REPORT_SECTIONS = 100;
export const MAX_REPORT_SNAPSHOT_SECTIONS = 20;
export const MAX_REPORT_TEXT_LENGTH = 100_000;
export const MAX_REPORT_STORAGE_BYTES = 1 * 1024 * 1024;
export const MAX_REPORT_HTML_BYTES = 5 * 1024 * 1024;

export function isReport(value: unknown): value is Report {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<Report>;
  return typeof report.id === "string" && report.id.length > 0
    && typeof report.projectId === "string" && report.projectId.length > 0
    && typeof report.title === "string" && report.title.trim().length > 0 && report.title.length <= 200
    && typeof report.createdAt === "string" && Number.isFinite(Date.parse(report.createdAt))
    && typeof report.updatedAt === "string" && Number.isFinite(Date.parse(report.updatedAt))
    && Array.isArray(report.sections) && report.sections.length <= MAX_REPORT_SECTIONS
    && report.sections.filter((section) => section?.kind === "snapshot").length <= MAX_REPORT_SNAPSHOT_SECTIONS
    && report.sections.every((section) => Boolean(section)
      && typeof section.id === "string" && section.id.length > 0
      && typeof section.title === "string" && section.title.length <= 200
      && SECTION_KINDS.has(section.kind)
      && (section.kind === "snapshot"
        ? typeof section.snapshotId === "string" && section.snapshotId.length > 0 && section.snapshotId.length <= 256
        : typeof section.content === "string" && section.content.length <= MAX_REPORT_TEXT_LENGTH))
    && isWithinStorageLimit(value);
}

function isWithinStorageLimit(value: unknown): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_REPORT_STORAGE_BYTES;
  } catch {
    return false;
  }
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
  source: {
    sessionId?: string;
    datasetName: string;
    rowCount: number;
    versionId: string;
    columns: Array<{ name: string; type: string; nullable?: boolean }>;
    lineage: ReportSnapshotLineage;
  };
  parameters: Record<string, unknown>;
  results: Record<string, unknown>;
}

export interface ReportSnapshotLineage {
  rootVersionId: string;
  nodes: Array<{
    versionId: string;
    projectId: string;
    name: string;
    operationType: "source" | "pipeline" | "append" | "join";
    sourceIds: string[];
    parentIds: string[];
    pipelineId: string | null;
    executedDefinition: unknown | null;
    rowCount: number;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    stepCount: number;
    createdAt: string;
  }>;
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function renderStatTable(title: string, record: Record<string, unknown>, labels: Record<string, string>): string {
  const rows = Object.entries(labels).filter(([key]) => Object.hasOwn(record, key)).map(([key, label]) =>
    `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(displayValue(record[key]))}</td></tr>`).join("");
  return rows ? `<h3>${escapeHtml(title)}</h3><table><tbody>${rows}</tbody></table>` : "";
}

interface ChartPoint { label: string; value: number | null }

function readChart(value: unknown): { title: string; kind: "bar" | "line"; points: ChartPoint[]; omitted: number } | null {
  if (!isRecord(value) || typeof value.title !== "string" || (value.kind !== "bar" && value.kind !== "line") || !Array.isArray(value.points)) return null;
  const sourcePoints = value.points.slice(0, 500);
  const points = sourcePoints.flatMap((point): ChartPoint[] => {
    if (!isRecord(point) || typeof point.label !== "string") return [];
    if (point.value !== null && (typeof point.value !== "number" || !Number.isFinite(point.value))) return [];
    return [{ label: point.label, value: point.value }];
  });
  return { title: value.title, kind: value.kind, points, omitted: Math.max(0, value.points.length - sourcePoints.length) };
}

function safeCoordinate(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "0";
}

/** SVG uses fixed markup and finite numeric coordinates; every text and attribute value is escaped. */
export function renderSnapshotChartSvg(chartValue: unknown): string | null {
  const chart = readChart(chartValue);
  if (!chart) return null;
  const points = chart.points.filter((point): point is ChartPoint & { value: number } => point.value !== null);
  if (points.length === 0) return `<figure><figcaption>${escapeHtml(chart.title)}</figcaption><p>El gráfico no tiene valores numéricos para mostrar.</p></figure>`;
  const width = 720;
  const height = 320;
  const left = 48;
  const right = 16;
  const top = 24;
  const bottom = 78;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = points.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const spread = max - min || 1;
  const y = (value: number) => top + ((max - value) / spread) * plotHeight;
  const zeroY = y(0);
  const band = plotWidth / points.length;
  const labelStep = Math.max(1, Math.ceil(points.length / 12));
  const marks = points.map((point, index) => {
    const centerX = left + band * (index + 0.5);
    if (chart.kind === "line") return `<circle cx="${safeCoordinate(centerX)}" cy="${safeCoordinate(y(point.value))}" r="3" fill="#5b45d6"/>`;
    const valueY = y(point.value);
    const barY = Math.min(valueY, zeroY);
    const barHeight = Math.max(1, Math.abs(zeroY - valueY));
    return `<rect x="${safeCoordinate(left + band * index + band * .15)}" y="${safeCoordinate(barY)}" width="${safeCoordinate(Math.max(1, band * .7))}" height="${safeCoordinate(barHeight)}" fill="#6651dc"/>`;
  }).join("");
  const linePath = chart.kind === "line"
    ? `<path d="${points.map((point, index) => `${index ? "L" : "M"} ${safeCoordinate(left + band * (index + .5))} ${safeCoordinate(y(point.value))}`).join(" ")}" fill="none" stroke="#5b45d6" stroke-width="2"/>`
    : "";
  const labels = points.map((point, index) => index % labelStep === 0
    ? `<text x="${safeCoordinate(left + band * (index + .5))}" y="${height - bottom + 18}" text-anchor="middle" font-size="10" transform="rotate(-35 ${safeCoordinate(left + band * (index + .5))} ${height - bottom + 18})">${escapeHtml(point.label)}</text>`
    : "").join("");
  const pointRows = chart.points.map((point) => `<tr><th scope="row">${escapeHtml(point.label)}</th><td>${escapeHtml(displayValue(point.value))}</td></tr>`).join("");
  return `<figure><figcaption>${escapeHtml(chart.title)}</figcaption><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(chart.title)}" viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px;height:auto" focusable="false"><line x1="${left}" y1="${safeCoordinate(zeroY)}" x2="${width - right}" y2="${safeCoordinate(zeroY)}" stroke="#64748b" stroke-width="1"/>${linePath}${marks}${labels}</svg><details><summary>Ver valores del gráfico</summary><table><tbody>${pointRows}</tbody></table></details>${chart.omitted ? `<p>Se muestran los primeros 500 puntos; se omitieron ${chart.omitted}.</p>` : ""}</figure>`;
}

function renderSnapshotResults(snapshot: ReportSnapshotView): string {
  const resultBlocks: string[] = [];
  const description = snapshot.results.description;
  if (isRecord(description)) {
    resultBlocks.push(renderStatTable("Estadística descriptiva", description, {
      column: "Columna", total: "Total de filas", valid: "Valores válidos", missing: "Faltantes",
      sum: "Suma", mean: "Media", median: "Mediana", mode: "Moda", min: "Mínimo", max: "Máximo",
      range: "Rango", variance: "Varianza muestral", stddev: "Desvío muestral", q1: "Q1", q3: "Q3", iqr: "IQR",
    }));
  } else if (description !== undefined) {
    resultBlocks.push(`<h3>Estadística descriptiva</h3><pre>${escapeHtml(pretty(description))}</pre>`);
  }
  const frequencies = snapshot.results.frequencies;
  if (isRecord(frequencies)) {
    const rows = Array.isArray(frequencies.rows) ? frequencies.rows.filter(isRecord).slice(0, 500) : [];
    resultBlocks.push(`<h3>Frecuencias de ${escapeHtml(displayValue(frequencies.column))}</h3><p>Valores válidos: ${escapeHtml(displayValue(frequencies.valid))}</p><table><thead><tr><th>Valor</th><th>Apariciones</th><th>% válidos</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(displayValue(row.value))}</td><td>${escapeHtml(displayValue(row.count))}</td><td>${escapeHtml(displayValue(row.pct))}</td></tr>`).join("")}</tbody></table>`);
  }
  const correlation = snapshot.results.correlation;
  if (isRecord(correlation)) {
    resultBlocks.push(`<h3>Correlación</h3><p>r de Pearson entre ${escapeHtml(displayValue(correlation.colA))} y ${escapeHtml(displayValue(correlation.colB))}: ${escapeHtml(displayValue(correlation.r))}, con ${escapeHtml(displayValue(correlation.pairs))} pares válidos. Correlación no implica causalidad.</p>`);
  }
  const findings = snapshot.results.findings;
  if (Array.isArray(findings)) {
    resultBlocks.push(`<h3>Hallazgos guardados</h3>${findings.length ? `<ul>${findings.filter(isRecord).slice(0, 500).map((finding) => `<li><strong>[${escapeHtml(displayValue(finding.rule))}]</strong> ${finding.column === undefined ? "" : `<span>${escapeHtml(displayValue(finding.column))}: </span>`}${escapeHtml(displayValue(finding.text))}</li>`).join("")}</ul>` : `<p>Sin hallazgos bajo los umbrales evaluados.</p>`}`);
  }
  const chart = snapshot.results.chart;
  if (chart !== undefined) resultBlocks.push(renderSnapshotChartSvg(chart) ?? `<h3>Gráfico guardado</h3><p>El formato del gráfico guardado no se reconoce.</p>`);
  const known = new Set(["description", "frequencies", "correlation", "findings", "chart"]);
  for (const [key, value] of Object.entries(snapshot.results)) {
    if (!known.has(key)) resultBlocks.push(`<h3>${escapeHtml(key)}</h3><pre>${escapeHtml(pretty(value))}</pre>`);
  }
  return resultBlocks.length ? resultBlocks.join("") : "<p>Este snapshot no contiene resultados compatibles para mostrar.</p>";
}

function renderSnapshotLineage(lineage: ReportSnapshotLineage | undefined): string {
  if (!lineage?.nodes.length) return "<p>Este snapshot no conserva datos de linaje.</p>";
  const names = new Map(lineage.nodes.map((node) => [node.versionId, node.name]));
  const nodes = lineage.nodes.map((node) => {
    const operation = { source: "Fuente", pipeline: "Transformación", append: "APPEND", join: "JOIN" }[node.operationType];
    const parents = node.parentIds.length
      ? node.parentIds.map((id) => `${names.get(id) ?? id} (${id})`).join(", ")
      : "Sin versiones predecesoras";
    const columns = node.columns.map((column) => `<li>${escapeHtml(column.name)} · ${escapeHtml(column.type)} · ${column.nullable ? "admite nulos" : "sin nulos"}</li>`).join("");
    const definition = node.executedDefinition === null
      ? ""
      : `<details><summary>Definición ejecutada</summary><pre>${escapeHtml(pretty(node.executedDefinition))}</pre></details>`;
    return `<li><h4>${operation}: ${escapeHtml(node.name)}</h4><p><strong>Versión:</strong> ${escapeHtml(node.versionId)} · ${escapeHtml(displayValue(node.rowCount))} filas · ${node.stepCount} pasos</p><p><strong>Fuentes:</strong> ${node.sourceIds.map(escapeHtml).join(", ")}</p><p><strong>Deriva de:</strong> ${escapeHtml(parents)}</p>${node.pipelineId ? `<p><strong>Pipeline:</strong> ${escapeHtml(node.pipelineId)}</p>` : ""}<details><summary>Esquema de esta versión (${node.columns.length} columnas)</summary><ul>${columns}</ul></details>${definition}</li>`;
  }).join("");
  return `<p>Linaje completo en orden de dependencias; versión analizada: ${escapeHtml(lineage.rootVersionId)}.</p><ol>${nodes}</ol>`;
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
    const nullableColumns = source.columns.filter((column) => column.nullable === true).length;
    const parameters = Object.entries(snapshot.parameters).map(([key, value]) => `<li><strong>${escapeHtml(key)}:</strong> ${escapeHtml(pretty(value))}</li>`).join("");
    const columns = source.columns.map((column) => `<tr><th scope="row">${escapeHtml(column.name)}</th><td>${escapeHtml(column.type)}</td><td>${column.nullable === undefined ? "No informado" : column.nullable ? "Admite nulos" : "No admite nulos"}</td></tr>`).join("");
    return `<section><h2>${escapeHtml(section.title)}</h2><p><strong>Snapshot:</strong> ${escapeHtml(snapshot.title)} · ${escapeHtml(snapshot.createdAt)}</p><h3>Fuente y esquema</h3><p><strong>Dataset:</strong> ${escapeHtml(source.datasetName)} · ${escapeHtml(displayValue(source.rowCount))} filas · versión ${escapeHtml(source.versionId)}${source.sessionId ? ` · sesión ${escapeHtml(source.sessionId)}` : ""}</p><p>${source.columns.length} columnas; ${nullableColumns} marcadas como capaces de admitir nulos según el esquema.</p><table><thead><tr><th>Columna</th><th>Tipo</th><th>Admite nulos</th></tr></thead><tbody>${columns}</tbody></table><h3>Linaje de fuentes y transformaciones</h3>${renderSnapshotLineage(source.lineage)}<h3>Parámetros guardados</h3>${parameters ? `<ul>${parameters}</ul>` : `<p>Sin parámetros.</p>`}<h3>Resultados congelados</h3>${renderSnapshotResults(snapshot)}</section>`;
  }).join("\n");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#172033}h1{border-bottom:1px solid #ddd;padding-bottom:.5rem}section{margin:2rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f8;padding:1rem;border-radius:.5rem}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{text-align:left;border:1px solid #d7dce5;padding:.45rem;overflow-wrap:anywhere}th{background:#f4f5f8}button{padding:.5rem 1rem}figure{margin:1rem 0}figcaption{font-weight:600}@media print{button{display:none}body{max-width:none;margin:0;padding:0}tr,figure{break-inside:avoid}}</style></head><body><button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button><h1>${escapeHtml(report.title)}</h1><p>Informe local · actualizado ${escapeHtml(report.updatedAt)}</p>${sections}</body></html>`;
  if (new TextEncoder().encode(html).byteLength > MAX_REPORT_HTML_BYTES) {
    throw new Error("El informe supera el límite de 5 MiB para exportar a HTML. Quite algunos snapshots o secciones.");
  }
  return html;
}
