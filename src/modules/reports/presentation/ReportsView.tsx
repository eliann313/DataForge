"use client";

import { useEffect, useMemo, useState } from "react";
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
}: {
  reports: ReportRepository;
  snapshots: ReportSnapshotReader<ReportSnapshotView>;
}) {
  const { active } = useProjects();
  const projectId = active?.id ?? "";
  const [reports, setReports] = useState<Report[]>([]);
  const [snapshots, setSnapshots] = useState<ReportSnapshotView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedSnapshots = useMemo(() => new Map(snapshots.map((item) => [item.id, item])), [snapshots]);

  async function load() {
    if (!projectId) return;
    setBusy(true);
    setMessage(null);
    try {
      const [savedReports, savedSnapshots] = await Promise.all([
        reportRepository.list(projectId), snapshotRepository.list(projectId),
      ]);
      setReports(savedReports);
      setSnapshots(savedSnapshots);
      const selected = savedReports.find((item) => item.id === selectedId) ?? savedReports[0] ?? null;
      setSelectedId(selected?.id ?? "");
      setDraft(selected);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudieron cargar los informes locales.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // IndexedDB access runs asynchronously and is cancelled when the project changes.
    let cancelled = false;
    (async () => {
      if (!projectId) return;
      setBusy(true);
      try {
        const [savedReports, savedSnapshots] = await Promise.all([
          reportRepository.list(projectId), snapshotRepository.list(projectId),
        ]);
        if (cancelled) return;
        setReports(savedReports);
        setSnapshots(savedSnapshots);
        const selected = savedReports[0] ?? null;
        setSelectedId(selected?.id ?? "");
        setDraft(selected);
      } catch (cause) {
        if (!cancelled) setMessage(cause instanceof Error ? cause.message : "No se pudieron cargar los informes locales.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, reportRepository, snapshotRepository]);

  function replaceSection(sectionIdToChange: string, changes: Partial<ReportSection>) {
    setDraft((current) => current ? {
      ...current,
      sections: current.sections.map((section) => section.id === sectionIdToChange ? { ...section, ...changes } : section),
    } : current);
  }

  function addEditorialSection(kind: typeof EDITORIAL_SECTIONS[number][0], title: string) {
    setDraft((current) => current ? {
      ...current,
      sections: [...current.sections, { id: sectionId(), kind, title, content: "" }],
    } : current);
  }

  function addSnapshot(snapshot: ReportSnapshotView) {
    setDraft((current) => current ? {
      ...current,
      sections: [...current.sections, { id: sectionId(), kind: "snapshot", title: snapshot.title, snapshotId: snapshot.id }],
    } : current);
  }

  function moveSection(index: number, delta: number) {
    setDraft((current) => {
      if (!current) return current;
      const target = index + delta;
      if (target < 0 || target >= current.sections.length) return current;
      const sections = [...current.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...current, sections };
    });
  }

  async function save() {
    if (!draft || !projectId) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = updateReport(draft, { title: draft.title, sections: draft.sections });
      await reportRepository.save(saved);
      setDraft(saved);
      setReports(await reportRepository.list(projectId));
      setSelectedId(saved.id);
      setMessage("Informe guardado en este dispositivo.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo guardar el informe.");
    } finally {
      setBusy(false);
    }
  }

  function exportHtml() {
    if (!draft) return;
    let blobUrl: string | null = null;
    try {
      const html = renderReportHtml(draft, selectedSnapshots);
      blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${draft.title.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-|-$/g, "") || "informe"}.html`;
      link.click();
      const createdUrl = blobUrl;
      window.setTimeout(() => URL.revokeObjectURL(createdUrl), 1000);
      setMessage("HTML exportado. Puede abrirlo e imprimirlo o guardarlo como PDF desde el navegador.");
    } catch (cause) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setMessage(cause instanceof Error ? cause.message : "No se pudo exportar el informe HTML.");
    }
  }

  function createNew() {
    if (!projectId) return;
    const created = createReport(projectId, "Nuevo informe");
    setDraft(created);
    setSelectedId(created.id);
  }

  if (!projectId) return <p role="status">Abra un proyecto para crear informes locales.</p>;

  return (
    <section className="space-y-5" aria-labelledby="reports-heading">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 id="reports-heading" className="text-2xl font-semibold">Informes</h1><p className="text-sm text-gray-600">Construya un informe con resultados guardados y texto propio.</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={createNew} className="rounded border px-3 py-2 text-sm">Nuevo informe</button>
          <button type="button" onClick={() => void save()} disabled={!draft || busy} className="rounded bg-violet-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Guardar</button>
          <button type="button" onClick={exportHtml} disabled={!draft} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Exportar HTML</button>
        </div>
      </header>
      {message ? <p role="status" className="text-sm text-gray-700">{message}</p> : null}
      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="space-y-2 rounded border bg-white p-3" aria-label="Informes guardados">
          <h2 className="font-medium">Guardados en este proyecto</h2>
          {reports.length === 0 ? <p className="text-sm text-gray-600">Todavía no hay informes.</p> : reports.map((report) => (
            <button key={report.id} type="button" onClick={() => { setSelectedId(report.id); setDraft(report); }} aria-pressed={draft?.id === report.id} className="block w-full rounded border px-2 py-2 text-left text-sm aria-pressed:border-violet-700 aria-pressed:bg-violet-50">{report.title}</button>
          ))}
          <button type="button" onClick={() => void load()} disabled={busy} className="text-sm text-violet-800 underline">Actualizar</button>
        </aside>
        {draft ? <div className="space-y-4 rounded border bg-white p-4">
          <label className="block text-sm font-medium">Título del informe<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1 block w-full rounded border px-3 py-2 font-normal" /></label>
          <div className="flex flex-wrap items-end gap-2 border-y py-3">
            <label className="min-w-56 flex-1 text-sm">Agregar snapshot guardado<select defaultValue="" onChange={(event) => { const snapshot = snapshots.find((item) => item.id === event.target.value); if (snapshot) addSnapshot(snapshot); event.currentTarget.value = ""; }} className="mt-1 block w-full rounded border px-2 py-2"><option value="">Seleccionar snapshot…</option>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.title} · {snapshot.source.datasetName}</option>)}</select></label>
            {EDITORIAL_SECTIONS.map(([kind, title]) => <button key={kind} type="button" onClick={() => addEditorialSection(kind, title)} className="rounded border px-2 py-2 text-sm">+ {title}</button>)}
          </div>
          {draft.sections.length === 0 ? <p className="text-sm text-gray-600">Agregue un snapshot o una sección de texto para empezar.</p> : <ol className="space-y-3">{draft.sections.map((section, index) => {
            const snapshot = section.kind === "snapshot" ? selectedSnapshots.get(section.snapshotId ?? "") : undefined;
            return <li key={section.id} className="rounded border p-3">
              <div className="mb-2 flex items-center gap-2">
                <input aria-label="Título de sección" value={section.title} onChange={(event) => replaceSection(section.id, { title: event.target.value })} className="min-w-0 flex-1 rounded border px-2 py-1 font-medium" />
                <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label="Mover sección arriba" className="rounded border px-2 py-1 disabled:opacity-40">↑</button>
                <button type="button" onClick={() => moveSection(index, 1)} disabled={index === draft.sections.length - 1} aria-label="Mover sección abajo" className="rounded border px-2 py-1 disabled:opacity-40">↓</button>
                <button type="button" onClick={() => setDraft({ ...draft, sections: draft.sections.filter((item) => item.id !== section.id) })} aria-label="Quitar sección" className="rounded border px-2 py-1">Quitar</button>
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
