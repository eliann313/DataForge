"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    {isRecord(description) ? <div><h4 className="font-medium">Estadística descriptiva</h4><dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">{Object.entries(description).map(([key, value]) => <div key={key}><dt className="text-gray-500">{key}</dt><dd className="break-words">{valueText(value)}</dd></div>)}</dl></div> : null}
    {isRecord(frequencies) ? <div><h4 className="font-medium">Frecuencias de {valueText(frequencies.column)}</h4><p>Valores válidos: {valueText(frequencies.valid)}</p>{Array.isArray(frequencies.rows) ? <ul className="list-inside list-disc">{frequencies.rows.slice(0, 20).map((row, index) => <li key={index}>{isRecord(row) ? `${valueText(row.value)}: ${valueText(row.count)} (${valueText(row.pct)} %)` : valueText(row)}</li>)}</ul> : null}</div> : null}
    {isRecord(correlation) ? <p><strong>Correlación:</strong> r de Pearson entre {valueText(correlation.colA)} y {valueText(correlation.colB)}: {valueText(correlation.r)}, con {valueText(correlation.pairs)} pares. Correlación no implica causalidad.</p> : null}
    {Array.isArray(findings) ? <div><h4 className="font-medium">Hallazgos ({findings.length})</h4>{findings.length ? <ul className="list-inside list-disc">{findings.slice(0, 20).map((finding, index) => <li key={index}>{isRecord(finding) ? `${valueText(finding.column)}: ${valueText(finding.text)}` : valueText(finding)}</li>)}</ul> : <p>Sin hallazgos bajo los umbrales evaluados.</p>}</div> : null}
    {isRecord(chart) ? <p><strong>Gráfico guardado:</strong> {valueText(chart.title)} ({Array.isArray(chart.points) ? chart.points.length : 0} puntos; se dibuja al exportar HTML).</p> : null}
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
  const projectReady = Boolean(projectId) && workspace.projectId === projectId && workspace.loaded;
  const visibleReports = projectReady ? workspace.reports : [];
  const visibleSnapshots = projectReady ? workspace.snapshots : [];
  const visibleDraft = projectReady ? workspace.draft : null;
  const visibleMessage = projectReady ? workspace.message : null;
  const projectBusy = !projectReady || workspace.busy;
  const selectedSnapshots = useMemo(() => new Map((projectReady ? workspace.snapshots : []).map((item) => [item.id, item])), [projectReady, workspace.snapshots]);

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
    setWorkspace((current) => current.projectId === projectId && current.draft ? {
      ...current, draft: { ...current.draft, sections: [...current.draft.sections, { id: sectionId(), kind, title, content: "" }] },
    } : current);
  }

  function addSnapshot(snapshot: ReportSnapshotView) {
    setWorkspace((current) => current.projectId === projectId && current.draft ? {
      ...current, draft: { ...current.draft, sections: [...current.draft.sections, { id: sectionId(), kind: "snapshot", title: snapshot.title, snapshotId: snapshot.id }] },
    } : current);
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
  }

  if (!projectId) return <p role="status">Abra un proyecto para crear informes locales.</p>;

  return (
    <section className="space-y-5" aria-labelledby="reports-heading">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 id="reports-heading" className="text-2xl font-semibold">Informes</h1><p className="text-sm text-gray-600">Construya un informe con resultados guardados y texto propio.</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={createNew} disabled={!projectReady} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Nuevo informe</button>
          <button type="button" onClick={() => void save()} disabled={!visibleDraft || projectBusy} className="rounded bg-violet-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Guardar</button>
          <button type="button" onClick={exportHtml} disabled={!visibleDraft || projectBusy} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Exportar HTML</button>
        </div>
      </header>
      {visibleMessage ? <p role="status" className="text-sm text-gray-700">{visibleMessage}</p> : null}
      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="space-y-2 rounded border bg-white p-3" aria-label="Informes guardados">
          <h2 className="font-medium">Guardados en este proyecto</h2>
          {!projectReady ? <p role="status" className="text-sm text-gray-600">Cargando informes de este proyecto…</p> : visibleReports.length === 0 ? <p className="text-sm text-gray-600">Todavía no hay informes.</p> : visibleReports.map((report) => (
            <button key={report.id} type="button" onClick={() => setWorkspace((current) => current.projectId === projectId ? { ...current, selectedId: report.id, draft: report } : current)} aria-pressed={visibleDraft?.id === report.id} className="block w-full rounded border px-2 py-2 text-left text-sm aria-pressed:border-violet-700 aria-pressed:bg-violet-50">{report.title}</button>
          ))}
          <button type="button" onClick={() => void load()} disabled={!projectReady || projectBusy} className="text-sm text-violet-800 underline">Actualizar</button>
        </aside>
        {visibleDraft ? <div className="space-y-4 rounded border bg-white p-4">
          <label className="block text-sm font-medium">Título del informe<input value={visibleDraft.title} onChange={(event) => setWorkspace((current) => current.projectId === projectId && current.draft ? { ...current, draft: { ...current.draft, title: event.target.value } } : current)} className="mt-1 block w-full rounded border px-3 py-2 font-normal" /></label>
          <div className="flex flex-wrap items-end gap-2 border-y py-3">
            <label className="min-w-56 flex-1 text-sm">Agregar snapshot guardado<select defaultValue="" disabled={!projectReady} onChange={(event) => { const snapshot = visibleSnapshots.find((item) => item.id === event.target.value); if (snapshot) addSnapshot(snapshot); event.currentTarget.value = ""; }} className="mt-1 block w-full rounded border px-2 py-2"><option value="">Seleccionar snapshot…</option>{visibleSnapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.title} · {snapshot.source.datasetName}</option>)}</select></label>
            {EDITORIAL_SECTIONS.map(([kind, title]) => <button key={kind} type="button" onClick={() => addEditorialSection(kind, title)} className="rounded border px-2 py-2 text-sm">+ {title}</button>)}
          </div>
          {visibleDraft.sections.length === 0 ? <p className="text-sm text-gray-600">Agregue un snapshot o una sección de texto para empezar.</p> : <ol className="space-y-3">{visibleDraft.sections.map((section, index) => {
            const snapshot = section.kind === "snapshot" ? selectedSnapshots.get(section.snapshotId ?? "") : undefined;
            return <li key={section.id} className="rounded border p-3">
              <div className="mb-2 flex items-center gap-2">
                <input aria-label="Título de sección" value={section.title} onChange={(event) => replaceSection(section.id, { title: event.target.value })} className="min-w-0 flex-1 rounded border px-2 py-1 font-medium" />
                <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label="Mover sección arriba" className="rounded border px-2 py-1 disabled:opacity-40">↑</button>
                <button type="button" onClick={() => moveSection(index, 1)} disabled={index === visibleDraft.sections.length - 1} aria-label="Mover sección abajo" className="rounded border px-2 py-1 disabled:opacity-40">↓</button>
                <button type="button" onClick={() => setWorkspace((current) => current.projectId === projectId && current.draft ? { ...current, draft: { ...current.draft, sections: current.draft.sections.filter((item) => item.id !== section.id) } } : current)} aria-label="Quitar sección" className="rounded border px-2 py-1">Quitar</button>
              </div>
              {section.kind === "snapshot" ? snapshot ? <div className="text-sm text-gray-700"><p>{snapshot.source.datasetName} · {snapshot.source.rowCount} filas · {snapshot.source.columns.length} columnas</p><SnapshotLineagePreview lineage={snapshot.source.lineage} /><SnapshotResultsPreview results={snapshot.results} /></div> : <p role="status" className="text-sm text-amber-800">El snapshot referenciado no está disponible en este proyecto; se conservará la referencia en el informe.</p> : <textarea aria-label={section.title} value={section.content ?? ""} onChange={(event) => replaceSection(section.id, { content: event.target.value })} rows={5} className="block w-full rounded border px-3 py-2" placeholder="Escriba texto plano para esta sección…" />}
            </li>;
          })}</ol>}
        </div> : <div className="rounded border bg-white p-8 text-center text-sm text-gray-600">Cree o seleccione un informe para editarlo.</div>}
      </div>
      <p className="text-xs text-gray-600">Los informes y snapshots se guardan localmente. Exportar HTML incluye un botón para imprimir o guardar como PDF desde el navegador. No incluye imágenes ni archivos fuente.</p>
    </section>
  );
}
