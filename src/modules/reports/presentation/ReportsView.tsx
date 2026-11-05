"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, BookOpen, Check, ChevronDown, CircleHelp, Database, FileText, GripVertical, Plus, Save, ShieldCheck, Trash2, Eye, Pencil, Download, RotateCw } from "lucide-react";
import { useProjects } from "@/modules/projects";
import {
  createReport,
  renderReportHtml,
  updateReport,
  type Report,
  type ReportRepository,
  type ReportSection,
  type ReportSnapshotReader,
  type ReportSnapshotView,
} from "@/modules/reports";

const EDITORIAL_SECTIONS = [
  ["observations", "Observaciones"],
  ["conclusions", "Conclusiones"],
  ["methodology", "Metodología"],
  ["limitations", "Límites"],
] as const;

interface ReportsWorkspace {
  projectId: string;
  loaded: boolean;
  reports: Report[];
  snapshots: ReportSnapshotView[];
  selectedId: string;
  draft: Report | null;
  busy: boolean;
  message: string | null;
}

function sectionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const DESCRIPTION_LABELS: Record<string, string> = {
  column: "Columna", total: "Filas totales", valid: "Valores válidos", missing: "Valores faltantes",
  sum: "Suma", mean: "Media", median: "Mediana", mode: "Moda", min: "Mínimo", max: "Máximo",
  range: "Rango", variance: "Varianza muestral", stddev: "Desvío muestral", q1: "Primer cuartil (Q1)",
  q3: "Tercer cuartil (Q3)", iqr: "Rango intercuartílico (IQR)",
};

function SnapshotChartPreview({ chart }: { chart: Record<string, unknown> }) {
  const points = Array.isArray(chart.points) ? chart.points.slice(0, 100).flatMap((point) => {
    if (!isRecord(point) || typeof point.label !== "string" || point.label.length > 500
      || typeof point.value !== "number" || !Number.isFinite(point.value)) return [];
    return [{ label: point.label, value: point.value }];
  }) : [];
  const kind = chart.kind === "line" ? "line" : chart.kind === "bar" ? "bar" : null;
  const title = typeof chart.title === "string" ? chart.title.slice(0, 500) : "Gráfico guardado";
  if (!kind || !points.length) return <p className="mt-2 text-sm text-slate-600">El gráfico guardado no contiene puntos numéricos compatibles para mostrar.</p>;
  const width = 640;
  const height = 240;
  const left = 42;
  const right = 12;
  const top = 12;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const scale = Math.max(1, ...points.map((point) => Math.abs(point.value)));
  const min = Math.min(0, ...points.map((point) => point.value / scale));
  const max = Math.max(0, ...points.map((point) => point.value / scale));
  const spread = max - min || 1;
  const y = (value: number) => top + ((max - value / scale) / spread) * plotHeight;
  const zeroY = y(0);
  const band = plotWidth / points.length;
  const coordinates = points.map((point, index) => ({
    x: left + band * (index + 0.5), y: y(point.value), value: point.value, label: point.label,
  }));
  const path = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(points.length / 10));
  const formatValue = (value: number) => String(value);
  return <figure className="mt-3" aria-label={`Gráfico: ${title}`}>
    <figcaption className="mb-2 font-medium">{title}</figcaption>
    <svg role="img" aria-label={`${kind === "bar" ? "Gráfico de barras" : "Gráfico de líneas"}: ${title}`} viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" focusable="false">
      <line x1={left} y1={zeroY} x2={width - right} y2={zeroY} stroke="#94a3b8" strokeWidth="1" />
      {kind === "line" ? <path d={path} fill="none" stroke="#6d28d9" strokeWidth="2.5" /> : null}
      {coordinates.map((point, index) => kind === "bar"
        ? <rect key={`${index}-${point.label}`} x={left + band * index + band * 0.15} y={Math.min(point.y, zeroY)} width={Math.max(1, band * 0.7)} height={Math.max(1, Math.abs(zeroY - point.y))} rx="3" fill="#7c3aed"><title>{`${point.label}: ${formatValue(point.value)}`}</title></rect>
        : <circle key={`${index}-${point.label}`} cx={point.x} cy={point.y} r="3.5" fill="#6d28d9"><title>{`${point.label}: ${formatValue(point.value)}`}</title></circle>)}
      {coordinates.map((point, index) => index % labelStep === 0 ? <text key={`${index}-${point.label}-label`} x={point.x} y={height - 12} textAnchor="middle" fontSize="11" fill="#475569">{point.label.slice(0, 24)}</text> : null)}
    </svg>
    {points.length < (Array.isArray(chart.points) ? chart.points.length : 0) ? <p className="mt-1 text-xs text-slate-600">Se muestran {points.length} puntos compatibles de {Array.isArray(chart.points) ? chart.points.length : 0}; la tabla conserva hasta 100 valores compatibles.</p> : null}
    <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-violet-800">Ver valores del gráfico</summary><div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr><th scope="col" className="px-2 py-1.5">Categoría</th><th scope="col" className="px-2 py-1.5">Valor</th></tr></thead><tbody>{points.map((point, index) => <tr key={`${index}-${point.label}`} className="border-t border-slate-100"><th scope="row" className="px-2 py-1.5 font-normal">{point.label}</th><td className="px-2 py-1.5 tabular-nums">{formatValue(point.value)}</td></tr>)}</tbody></table></div></details>
  </figure>;
}

function SnapshotLineagePreview({ lineage }: { lineage: ReportSnapshotView["source"]["lineage"] }) {
  if (!lineage?.nodes.length) return <p className="mt-2 text-xs text-gray-500">Este snapshot no conserva datos de linaje.</p>;
  return <details className="mt-2">
    <summary>Linaje de {lineage.nodes.length} versiones y todas sus fuentes</summary>
    <ol className="mt-2 list-inside list-decimal space-y-2">{lineage.nodes.map((node) => <li key={node.versionId}>
      <strong>{node.operationType}: {node.name}</strong> · {node.rowCount} filas · {node.stepCount} pasos
      <p className="ml-5 text-xs">Versión {node.versionId}; fuentes: {node.sourceIds.join(", ") || "ninguna"}; deriva de: {node.parentIds.join(", ") || "origen"}</p>
      {node.pipelineId ? <p className="ml-5 text-xs">Pipeline {node.pipelineId}</p> : null}
      {node.executedDefinition !== null ? <details className="ml-5 text-xs"><summary>Definición ejecutada</summary><pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-50 p-2">{JSON.stringify(node.executedDefinition, null, 2)}</pre></details> : null}
    </li>)}</ol>
  </details>;
}

function SnapshotResultsPreview({ results }: { results: Record<string, unknown> }) {
  const description = results.description;
  const frequencies = results.frequencies;
  const correlation = results.correlation;
  const findings = results.findings;
  const chart = results.chart;
  const known = new Set(["description", "frequencies", "correlation", "findings", "chart"]);
  const additional = Object.entries(results).filter(([key]) => !known.has(key));
  return <div className="mt-2 space-y-3 text-sm">
    {isRecord(description) ? <div><h4 className="font-medium">Estadística descriptiva</h4><dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">{Object.entries(description).map(([key, value]) => <div key={key}><dt className="text-gray-500">{DESCRIPTION_LABELS[key] ?? key}</dt><dd className="break-words tabular-nums">{valueText(value)}</dd></div>)}</dl></div> : null}
    {isRecord(frequencies) ? <div><h4 className="font-medium">Frecuencias de {valueText(frequencies.column)}</h4><p>Valores válidos: {valueText(frequencies.valid)}</p>{Array.isArray(frequencies.rows) ? <ul className="list-inside list-disc">{frequencies.rows.slice(0, 20).map((row, index) => <li key={index}>{isRecord(row) ? `${valueText(row.value)}: ${valueText(row.count)} (${valueText(row.pct)} %)` : valueText(row)}</li>)}</ul> : null}</div> : null}
    {isRecord(correlation) ? <p><strong>Correlación:</strong> r de Pearson entre {valueText(correlation.colA)} y {valueText(correlation.colB)}: {valueText(correlation.r)}, con {valueText(correlation.pairs)} pares. Correlación no implica causalidad.</p> : null}
    {Array.isArray(findings) ? <div><h4 className="font-medium">Hallazgos ({findings.length})</h4>{findings.length ? <ul className="list-inside list-disc">{findings.slice(0, 20).map((finding, index) => <li key={index}>{isRecord(finding) ? `${valueText(finding.column)}: ${valueText(finding.text)}` : valueText(finding)}</li>)}</ul> : <p>Sin hallazgos bajo los umbrales evaluados.</p>}</div> : null}
    {isRecord(chart) ? <SnapshotChartPreview chart={chart} /> : null}
    {additional.length ? <details><summary>Otros resultados</summary><pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(Object.fromEntries(additional), null, 2)}</pre></details> : null}
    {!Object.keys(results).length ? <p>Este snapshot no contiene resultados.</p> : null}
  </div>;
}

/** Snapshot types are injected through the public repository port at the composition boundary. */
export default function ReportsView({
  reports: reportRepository,
  snapshots: snapshotRepository,
  active: viewIsActive,
}: {
  reports: ReportRepository;
  snapshots: ReportSnapshotReader<ReportSnapshotView>;
  active: boolean;
}) {
  const { active } = useProjects();
  const projectId = active?.id ?? "";
  const operationRevision = useRef(0);
  const [workspace, setWorkspace] = useState<ReportsWorkspace>({
    projectId: "", loaded: false, reports: [], snapshots: [], selectedId: "", draft: null, busy: false, message: null,
  });
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const projectReady = Boolean(projectId) && workspace.projectId === projectId && workspace.loaded;
  const visibleReports = projectReady ? workspace.reports : [];
  const visibleSnapshots = projectReady ? workspace.snapshots : [];
  const visibleDraft = projectReady ? workspace.draft : null;
  const visibleMessage = projectReady ? workspace.message : null;
  const projectBusy = !projectReady || workspace.busy;
  const selectedSnapshots = useMemo(() => new Map((projectReady ? workspace.snapshots : []).map((item) => [item.id, item])), [projectReady, workspace.snapshots]);

  useEffect(() => {
    setSelectedSectionId("");
    setPreviewMode(false);
  }, [projectId]);

  const loadProject = useCallback(async (targetProjectId: string, revision: number) => {
    const isCurrent = () => operationRevision.current === revision;
    if (!targetProjectId || !isCurrent()) return;
    try {
      const [savedReports, savedSnapshots] = await Promise.all([
        reportRepository.list(targetProjectId), snapshotRepository.list(targetProjectId),
      ]);
      if (!isCurrent()) return;
      setWorkspace((current) => {
        const selected = current.projectId === targetProjectId && current.draft
          ? savedReports.find((item) => item.id === current.draft?.id) ?? current.draft
          : savedReports[0] ?? null;
        return {
          projectId: targetProjectId, loaded: true, reports: savedReports, snapshots: savedSnapshots,
          selectedId: selected?.id ?? "", draft: selected, busy: false, message: null,
        };
      });
    } catch (cause) {
      if (!isCurrent()) return;
      setWorkspace((current) => {
        const belongsToProject = current.projectId === targetProjectId;
        return {
          projectId: targetProjectId, loaded: true,
          reports: belongsToProject ? current.reports : [],
          snapshots: belongsToProject ? current.snapshots : [],
          selectedId: belongsToProject ? current.selectedId : "",
          draft: belongsToProject ? current.draft : null,
          busy: false,
          message: cause instanceof Error ? cause.message : "No se pudieron cargar los informes locales.",
        };
      });
    } finally {
      if (isCurrent()) setWorkspace((current) => current.projectId === targetProjectId ? { ...current, busy: false } : current);
    }
  }, [reportRepository, snapshotRepository]);

  async function load() {
    if (!projectReady || !viewIsActive) return;
    const revision = ++operationRevision.current;
    setWorkspace((current) => current.projectId === projectId ? { ...current, busy: true, message: null } : current);
    await loadProject(projectId, revision);
  }

  useEffect(() => {
    const targetProjectId = projectId;
    const revision = ++operationRevision.current;
    if (viewIsActive && targetProjectId) void loadProject(targetProjectId, revision);
    return () => {
      operationRevision.current += 1;
    };
  }, [projectId, loadProject, viewIsActive]);

  function replaceSection(sectionIdToChange: string, changes: Partial<ReportSection>) {
    setWorkspace((current) => current.projectId === projectId && current.draft ? {
      ...current,
      draft: { ...current.draft, sections: current.draft.sections.map((section) => section.id === sectionIdToChange ? { ...section, ...changes } : section) },
    } : current);
  }

  function addEditorialSection(kind: typeof EDITORIAL_SECTIONS[number][0], title: string) {
    const id = sectionId();
    setWorkspace((current) => current.projectId === projectId && current.draft ? {
      ...current, draft: { ...current.draft, sections: [...current.draft.sections, { id, kind, title, content: "" }] },
    } : current);
    setSelectedSectionId(id);
    setPreviewMode(false);
  }

  function addSnapshot(snapshot: ReportSnapshotView) {
    const id = sectionId();
    setWorkspace((current) => current.projectId === projectId && current.draft ? {
      ...current, draft: { ...current.draft, sections: [...current.draft.sections, { id, kind: "snapshot", title: snapshot.title, snapshotId: snapshot.id }] },
    } : current);
    setSelectedSectionId(id);
    setPreviewMode(false);
  }

  function moveSection(index: number, delta: number) {
    setWorkspace((current) => {
      if (current.projectId !== projectId || !current.draft) return current;
      const target = index + delta;
      if (target < 0 || target >= current.draft.sections.length) return current;
      const sections = [...current.draft.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...current, draft: { ...current.draft, sections } };
    });
  }

  async function save() {
    const targetProjectId = projectId;
    const report = visibleDraft;
    if (!report || !targetProjectId || !projectReady || !viewIsActive || report.projectId !== targetProjectId) return;
    const revision = ++operationRevision.current;
    setWorkspace((current) => current.projectId === targetProjectId ? { ...current, busy: true, message: null } : current);
    try {
      const saved = updateReport(report, { title: report.title, sections: report.sections });
      await reportRepository.save(saved);
      if (operationRevision.current !== revision) return;
      const savedReports = await reportRepository.list(targetProjectId);
      if (operationRevision.current !== revision) return;
      setWorkspace((current) => current.projectId === targetProjectId ? {
        ...current, draft: saved, reports: savedReports, selectedId: saved.id, message: "Informe guardado en este dispositivo.",
      } : current);
    } catch (cause) {
      if (operationRevision.current === revision) setWorkspace((current) => current.projectId === targetProjectId ? {
        ...current, message: cause instanceof Error ? cause.message : "No se pudo guardar el informe.",
      } : current);
    } finally {
      if (operationRevision.current === revision) setWorkspace((current) => current.projectId === targetProjectId ? { ...current, busy: false } : current);
    }
  }

  function exportHtml() {
    const targetProjectId = projectId;
    const report = visibleDraft;
    if (!report || !projectReady || !viewIsActive || report.projectId !== targetProjectId) return;
    let blobUrl: string | null = null;
    try {
      const html = renderReportHtml(report, selectedSnapshots);
      blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${report.title.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-|-$/g, "") || "informe"}.html`;
      link.click();
      const createdUrl = blobUrl;
      window.setTimeout(() => URL.revokeObjectURL(createdUrl), 1000);
      setWorkspace((current) => current.projectId === targetProjectId ? { ...current, message: "HTML exportado. Puede abrirlo e imprimirlo o guardarlo como PDF desde el navegador." } : current);
    } catch (cause) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setWorkspace((current) => current.projectId === targetProjectId ? { ...current, message: cause instanceof Error ? cause.message : "No se pudo exportar el informe HTML." } : current);
    }
  }

  function createNew() {
    if (!projectId || !projectReady || !viewIsActive) return;
    const created = createReport(projectId, "Nuevo informe");
    setWorkspace((current) => current.projectId === projectId ? { ...current, draft: created, selectedId: created.id } : current);
    setSelectedSectionId("");
    setPreviewMode(false);
  }

  const savedDraft = visibleDraft ? visibleReports.find((item) => item.id === visibleDraft.id) : undefined;
  const hasUnsavedChanges = Boolean(visibleDraft && (!savedDraft
    || savedDraft.title !== visibleDraft.title
    || JSON.stringify(savedDraft.sections) !== JSON.stringify(visibleDraft.sections)));
  const selectedSection = visibleDraft?.sections.find((section) => section.id === selectedSectionId)
    ?? visibleDraft?.sections[0];

  function selectReport(report: Report) {
    setWorkspace((current) => current.projectId === projectId ? { ...current, selectedId: report.id, draft: report } : current);
    setSelectedSectionId(report.sections[0]?.id ?? "");
    setPreviewMode(false);
  }

  function removeSection(id: string) {
    const currentIndex = visibleDraft?.sections.findIndex((section) => section.id === id) ?? -1;
    const nextSection = visibleDraft?.sections[currentIndex + 1] ?? visibleDraft?.sections[currentIndex - 1];
    setWorkspace((current) => current.projectId === projectId && current.draft ? {
      ...current, draft: { ...current.draft, sections: current.draft.sections.filter((item) => item.id !== id) },
    } : current);
    setSelectedSectionId(nextSection?.id ?? "");
  }

  const sectionKindLabel = (section: ReportSection) => section.kind === "snapshot"
    ? "Resultados guardados"
    : ({ observations: "Observaciones", conclusions: "Conclusiones", methodology: "Metodología", limitations: "Límites" }[section.kind]);

  function SnapshotDocument({ snapshot }: { snapshot: ReportSnapshotView }) {
    return <article className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-800"><Database size={15} aria-hidden="true" /> Snapshot guardado</div>
        <h3 className="text-xl font-semibold text-slate-950">{snapshot.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{snapshot.source.datasetName} · {snapshot.source.rowCount} filas · {snapshot.source.columns.length} columnas</p>
        <p className="mt-1 break-all text-xs text-slate-500">Versión {snapshot.source.versionId}</p>
      </div>
      <div><h4 className="mb-2 font-semibold text-slate-900">Resultados guardados</h4><SnapshotResultsPreview results={snapshot.results} /></div>
      <div className="border-t border-slate-200 pt-4"><h4 className="font-semibold text-slate-900">Fuentes y transformaciones</h4><SnapshotLineagePreview lineage={snapshot.source.lineage} /></div>
      <details className="border-t border-slate-200 pt-4 text-sm"><summary className="cursor-pointer font-medium">Esquema y parámetros</summary>
        <h5 className="mt-3 font-medium">Columnas del dataset</h5>
        <ul className="mt-1 grid gap-1 sm:grid-cols-2">{snapshot.source.columns.map((column) => <li key={column.name} className="rounded bg-slate-50 px-2 py-1">{column.name} <span className="text-slate-500">· {column.type}{column.nullable === undefined ? "" : column.nullable ? " · admite nulos" : " · sin nulos"}</span></li>)}</ul>
        <h5 className="mt-3 font-medium">Parámetros guardados</h5>
        {Object.keys(snapshot.parameters).length ? <dl className="mt-1 space-y-1">{Object.entries(snapshot.parameters).map(([key, value]) => <div key={key} className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-2"><dt className="text-slate-500">{key}</dt><dd className="break-words">{valueText(value)}</dd></div>)}</dl> : <p className="mt-1 text-slate-500">Este snapshot no registra parámetros.</p>}
      </details>
    </article>;
  }

  if (!projectId) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center" role="status"><FileText size={28} className="mx-auto mb-3 text-violet-700" aria-hidden="true" /><h1 className="text-lg font-semibold">Informes</h1><p className="mt-1 text-sm text-slate-600">Abra un proyecto para crear informes locales.</p></div>;

  return (
    <section className="space-y-4 text-slate-900" aria-labelledby="reports-heading">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="mb-1 flex items-center gap-2 text-xs font-medium text-violet-800"><span className="rounded-full bg-violet-100 px-2.5 py-1">Report Builder · local</span><span className="inline-flex items-center gap-1"><ShieldCheck size={14} aria-hidden="true" /> Privado en este dispositivo</span></div><h1 id="reports-heading" className="text-2xl font-semibold tracking-tight">Informes</h1><p className="mt-1 text-sm text-slate-600">Organiza resultados guardados y texto propio en un documento reproducible.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={createNew} disabled={!projectReady} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50"><Plus size={16} aria-hidden="true" /> Nuevo informe</button>
          <button type="button" onClick={() => void save()} disabled={!visibleDraft || projectBusy || !hasUnsavedChanges} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 disabled:opacity-50"><Save size={16} aria-hidden="true" /> Guardar cambios</button>
          <button type="button" onClick={exportHtml} disabled={!visibleDraft || projectBusy} className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50"><Download size={16} aria-hidden="true" /> Exportar HTML</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-violet-100 p-2 text-violet-800"><FileText size={19} aria-hidden="true" /></div><div className="min-w-0"><p className="truncate font-semibold">{visibleDraft?.title ?? "Sin informe seleccionado"}</p><p className="flex items-center gap-1.5 text-xs text-slate-600" role="status">{!projectReady ? "Cargando informes del proyecto…" : hasUnsavedChanges ? <><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> Cambios sin guardar</> : visibleDraft ? <><Check size={13} className="text-emerald-700" aria-hidden="true" /> Guardado en este dispositivo</> : "Cree o seleccione un informe"}</p></div></div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Modo de visualización del informe">
          <button type="button" onClick={() => setPreviewMode(false)} aria-pressed={!previewMode} className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm aria-pressed:bg-white aria-pressed:text-violet-800 aria-pressed:shadow-sm"><Pencil size={15} aria-hidden="true" /> Editar</button>
          <button type="button" onClick={() => setPreviewMode(true)} aria-pressed={previewMode} className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm aria-pressed:bg-white aria-pressed:text-violet-800 aria-pressed:shadow-sm"><Eye size={15} aria-hidden="true" /> Vista previa</button>
        </div>
      </div>
      {visibleMessage ? <p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{visibleMessage}</p> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_18rem]">
        <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Estructura del informe">
          <div><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Informes del proyecto</h2><button type="button" onClick={() => void load()} disabled={!projectReady || projectBusy} aria-label="Actualizar lista de informes" className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50"><RotateCw size={15} aria-hidden="true" /></button></div>
            <div className="mt-2 space-y-1">{!projectReady ? <p role="status" className="text-sm text-slate-500">Cargando…</p> : visibleReports.length === 0 ? <p className="rounded-lg bg-slate-50 p-2 text-xs leading-relaxed text-slate-600">Aún no hay informes guardados. Cree uno para comenzar.</p> : visibleReports.map((report) => <button key={report.id} type="button" onClick={() => selectReport(report)} aria-pressed={visibleDraft?.id === report.id} className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50 aria-pressed:bg-violet-50 aria-pressed:font-medium aria-pressed:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">{report.title}</button>)}</div>
          </div>
          <div className="border-t border-slate-200 pt-4"><div className="mb-2"><h2 className="font-semibold">Estructura del informe</h2><p className="mt-1 text-xs leading-relaxed text-slate-600">Selecciona una sección para editarla y ajusta su orden.</p></div>
            {visibleDraft?.sections.length ? <ol className="space-y-1">{visibleDraft.sections.map((section, index) => <li key={section.id} className="group flex items-center gap-1 rounded-lg border border-transparent hover:border-slate-200">
              <button type="button" onClick={() => { setSelectedSectionId(section.id); setPreviewMode(false); }} aria-current={selectedSection?.id === section.id ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm aria-current:bg-violet-50 aria-current:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"><GripVertical size={14} className="shrink-0 text-slate-400" aria-hidden="true" /><span className="shrink-0 text-violet-700">{section.kind === "snapshot" ? <BarChart3 size={16} aria-hidden="true" /> : <BookOpen size={16} aria-hidden="true" />}</span><span className="min-w-0 truncate">{section.title || "Sección sin título"}</span></button>
              <span className="sr-only">{sectionKindLabel(section)}</span>
              <div className="flex shrink-0 opacity-70 group-hover:opacity-100 group-focus-within:opacity-100"><button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label={`Mover ${section.title} hacia arriba`} className="rounded p-1 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-30"><ArrowUp size={14} aria-hidden="true" /></button><button type="button" onClick={() => moveSection(index, 1)} disabled={index === visibleDraft.sections.length - 1} aria-label={`Mover ${section.title} hacia abajo`} className="rounded p-1 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-30"><ArrowDown size={14} aria-hidden="true" /></button></div>
            </li>)}</ol> : <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">Agrega resultados guardados o texto para construir la estructura.</p>}
            {visibleDraft ? <div className="mt-3 space-y-2"><label className="block text-xs font-medium text-slate-700" htmlFor="add-report-snapshot">Añadir resultados guardados</label><div className="relative"><select id="add-report-snapshot" defaultValue="" disabled={!projectReady || visibleSnapshots.length === 0 || !visibleDraft} onChange={(event) => { const snapshot = visibleSnapshots.find((item) => item.id === event.target.value); if (snapshot) addSnapshot(snapshot); event.currentTarget.value = ""; }} className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-2.5 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:bg-slate-50 disabled:text-slate-500"><option value="">{visibleSnapshots.length ? "Seleccionar snapshot…" : "No hay snapshots guardados"}</option>{visibleSnapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.title} · {snapshot.source.datasetName}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" /></div>
              <label className="block text-xs font-medium text-slate-700" htmlFor="add-report-section">Añadir sección editorial</label><div className="relative"><select id="add-report-section" defaultValue="" onChange={(event) => { const item = EDITORIAL_SECTIONS.find(([kind]) => kind === event.target.value); if (item) addEditorialSection(item[0], item[1]); event.currentTarget.value = ""; }} className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-2.5 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"><option value="">Elegir sección…</option>{EDITORIAL_SECTIONS.map(([kind, title]) => <option key={kind} value={kind}>{title}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" /></div></div> : null}
          </div>
        </aside>

        <main className="min-h-[32rem] rounded-xl border border-slate-200 bg-slate-100/80 p-3 shadow-inner sm:p-5" aria-label={previewMode ? "Vista previa del informe" : "Editor del informe"}>
          {visibleDraft ? <article className="mx-auto min-h-[30rem] max-w-3xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-label="Documento del informe">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4"><div className="flex items-center gap-2 text-sm font-semibold"><span className="rounded-md bg-violet-100 p-1.5 text-violet-800"><FileText size={17} aria-hidden="true" /></span> DataForge</div><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-800">Vista de trabajo · datos guardados</span></div>
            {previewMode ? <><h2 className="text-2xl font-semibold tracking-tight">{visibleDraft.title}</h2><p className="mt-1 text-sm text-slate-600">Documento local · {visibleDraft.sections.length} {visibleDraft.sections.length === 1 ? "sección" : "secciones"}</p><div className="mt-5 space-y-7">{visibleDraft.sections.length ? visibleDraft.sections.map((section) => {
              const snapshot = section.kind === "snapshot" ? selectedSnapshots.get(section.snapshotId ?? "") : undefined;
              return <section key={section.id} className="border-t border-slate-200 pt-5"><h3 className="text-lg font-semibold">{section.title}</h3>{section.kind === "snapshot" ? snapshot ? <SnapshotDocument snapshot={snapshot} /> : <p role="status" className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">El snapshot referenciado ya no está disponible en este proyecto. La referencia se conserva para el informe.</p> : <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{section.content?.trim() || <span className="italic text-slate-500">Esta sección todavía no tiene texto.</span>}</p>}</section>;
            }) : <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center"><FileText size={27} className="mx-auto text-slate-400" aria-hidden="true" /><h3 className="mt-3 font-medium">El informe todavía está vacío</h3><p className="mt-1 text-sm text-slate-600">Añade un snapshot guardado o una sección editorial. No se mostrarán datos hasta que los incluyas.</p></div>}</div></> : <>
              <h2 className="text-2xl font-semibold tracking-tight">{visibleDraft.title}</h2><p className="mt-1 text-sm text-slate-600">Edita el contenido de cada sección; los resultados provienen de snapshots existentes.</p>
              {!selectedSection ? <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center"><FileText size={28} className="mx-auto text-slate-400" aria-hidden="true" /><h3 className="mt-3 font-medium">Empieza a construir el informe</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-600">Añade resultados guardados de Análisis o una sección de texto desde el panel Estructura.</p></div> : <section className="mt-6 rounded-xl border border-violet-200 bg-white p-4 ring-1 ring-violet-50 sm:p-5" aria-labelledby="active-section-title"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-violet-800">{sectionKindLabel(selectedSection)}</p><h3 id="active-section-title" className="mt-1 text-lg font-semibold">{selectedSection.title}</h3></div><button type="button" onClick={() => removeSection(selectedSection.id)} aria-label={`Quitar sección ${selectedSection.title}`} className="rounded-md p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"><Trash2 size={16} aria-hidden="true" /></button></div>
                <label className="mb-4 block text-sm font-medium" htmlFor="active-section-title-input">Título de sección<input id="active-section-title-input" value={selectedSection.title} onChange={(event) => replaceSection(selectedSection.id, { title: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600" /></label>
                {selectedSection.kind === "snapshot" ? selectedSnapshots.get(selectedSection.snapshotId ?? "") ? <SnapshotDocument snapshot={selectedSnapshots.get(selectedSection.snapshotId ?? "")!} /> : <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">El snapshot referenciado no está disponible en este proyecto; se conservará la referencia.</p> : <label className="block text-sm font-medium" htmlFor="active-section-content">Contenido editorial<textarea id="active-section-content" value={selectedSection.content ?? ""} onChange={(event) => replaceSection(selectedSection.id, { content: event.target.value })} rows={9} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600" placeholder="Escribe observaciones, conclusiones o metodología…" /><span className="mt-1 block text-xs font-normal text-slate-500">Texto plano. El contenido se escapa al generar HTML.</span></label>}
              </section>}
            </>}
          </article> : <div className="mx-auto flex min-h-[28rem] max-w-3xl flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-center"><FileText size={30} className="text-violet-700" aria-hidden="true" /><h2 className="mt-3 font-semibold">Crea o selecciona un informe</h2><p className="mt-1 text-sm text-slate-600">El informe y sus resultados permanecen dentro de este proyecto local.</p><button type="button" onClick={createNew} disabled={!projectReady} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50"><Plus size={15} aria-hidden="true" /> Nuevo informe</button></div>}
        </main>

        <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Propiedades del informe">
          <div><h2 className="font-semibold">Propiedades</h2><p className="mt-1 text-xs leading-relaxed text-slate-600">Configura el título y revisa el origen de los resultados.</p></div>
          <label className="block text-sm font-medium" htmlFor="report-title">Título del informe<input id="report-title" value={visibleDraft?.title ?? ""} disabled={!visibleDraft} onChange={(event) => setWorkspace((current) => current.projectId === projectId && current.draft ? { ...current, draft: { ...current.draft, title: event.target.value } } : current)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:bg-slate-50" /></label>
          <div><h3 className="text-sm font-medium">Origen de resultados</h3>{visibleDraft?.sections.some((section) => section.kind === "snapshot") ? <ul className="mt-2 space-y-2">{visibleDraft.sections.filter((section) => section.kind === "snapshot").map((section) => { const snapshot = selectedSnapshots.get(section.snapshotId ?? ""); return <li key={section.id} className="rounded-lg border border-slate-200 p-2.5"><p className="flex items-start gap-2 text-sm font-medium"><Database size={15} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" /><span>{snapshot?.source.datasetName ?? "Snapshot no disponible"}</span></p><p className="mt-1 break-all text-xs text-slate-600">{snapshot ? `${snapshot.source.rowCount} filas · ${snapshot.source.columns.length} columnas · ${snapshot.source.versionId}` : `Referencia: ${section.snapshotId}`}</p></li>; })}</ul> : <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-600">Sin dataset asociado. Añade un snapshot guardado para incluir resultados y su linaje.</p>}</div>
          <div className="rounded-xl bg-violet-50 p-3"><div className="flex gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-violet-800" aria-hidden="true" /><div><h3 className="text-sm font-semibold text-violet-950">Trazabilidad y privacidad local</h3><p className="mt-1 text-xs leading-relaxed text-violet-950">Los snapshots conservan sus resultados, parámetros y linaje. El informe se guarda en este dispositivo; no incluye archivos fuente.</p></div></div></div>
          <div className="border-t border-slate-200 pt-3"><h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><CircleHelp size={14} aria-hidden="true" /> Exportación</h3><p className="mt-1 text-xs leading-relaxed text-slate-600">Exportar genera HTML con los snapshots referenciados. Puede imprimirlo o guardarlo como PDF desde el navegador.</p></div>
        </aside>
      </div>
      <p className="flex items-start gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-950"><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />Los informes y snapshots se guardan localmente por proyecto. Los resultados mostrados proceden de snapshots; no se generan cifras de ejemplo.</p>
    </section>
  );
}
