"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, BarChart3, ChartNoAxesColumn, CircleHelp, FileChartColumn, Layers3, LockKeyhole, RefreshCw, ShieldCheck, Sigma, Sparkles, Table2, Upload } from "lucide-react";
import { captureSnapshotLineage, createAnalysisSnapshot, evaluateFindings, IndexedDBAnalysisSnapshotRepository, type AnalysisSnapshot, type Finding, type SnapshotValue } from "@/modules/analysis";
import { isNumericMeasure, type SemanticRole } from "@/platform/engines/duckdb/semantics";
import {
  engine,
  type ColumnInfo,
  type Correlation,
  type FrequencyTable,
  type Histogram,
  type NumericDescription,
} from "@/platform/engines/duckdb/manager";

// ECharts solo en cliente (exportación estática: sin DOM en prerender).
const ChartView = dynamic(
  () => import("@/app/components/ChartView"),
  { ssr: false, loading: () => <p>Cargando gráfico…</p> },
);

function fmt(v: number | null): string {
  return v === null ? "—" : String(v);
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "nulo";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const ANALYSIS_SESSION_ID =
  globalThis.crypto?.randomUUID?.() ??
  (() => {
    const c = globalThis.crypto;
    if (c?.getRandomValues) {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `session-${hex}`;
    }
    return "session-unavailable-crypto";
  })();

// Vista Análisis (E5): descriptivos verificables, frecuencias, gráficos sobre
// agregados, correlación justificada y hallazgos por reglas transparentes.
export default function AnalysisView({
  onNavigateToData,
  onTryExample,
}: {
  onNavigateToData?: () => void;
  onTryExample?: () => void;
}) {
  const snapshotsRepo = useRef(new IndexedDBAnalysisSnapshotRepository());
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [roles, setRoles] = useState<Record<string, SemanticRole>>({});
  const revision = useRef(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [descCol, setDescCol] = useState("");
  const [desc, setDesc] = useState<NumericDescription | null>(null);
  const [freqCol, setFreqCol] = useState("");
  const [freq, setFreq] = useState<FrequencyTable | null>(null);

  const [chartKind, setChartKind] = useState<"bar" | "line" | "hist">("bar");
  const [xCol, setXCol] = useState("");
  const [yCol, setYCol] = useState("");
  const [agg, setAgg] = useState<"count" | "sum" | "mean">("count");
  const [bins, setBins] = useState(10);
  const [chart, setChart] = useState<{ title: string; kind: "bar" | "line"; points: { label: string; value: number | null }[] } | null>(null);

  const [corrA, setCorrA] = useState("");
  const [corrB, setCorrB] = useState("");
  const [corr, setCorr] = useState<Correlation | null>(null);

  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [resultParameters, setResultParameters] = useState<Record<string, SnapshotValue>>({});
  const [analyzedVersionId, setAnalyzedVersionId] = useState<string | null>(null);
  const [snapshotTitle, setSnapshotTitle] = useState("");
  const [snapshots, setSnapshots] = useState<AnalysisSnapshot[]>([]);
  const [snapshotMessage, setSnapshotMessage] = useState<{ projectId: string | null; text: string } | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<AnalysisSnapshot | null>(null);

  const measureColumns = columns.filter((column) => isNumericMeasure(column, roles));

  const projectId = engine.getCurrentProjectId();
  const projectSnapshots = projectId ? snapshots.filter((snapshot) => snapshot.projectId === projectId) : [];
  const activeSummary = engine.getActiveDatasetSummary();
  const visibleSnapshotMessage = snapshotMessage?.projectId === projectId ? snapshotMessage.text : null;
  const visibleSelectedSnapshot = selectedSnapshot?.projectId === projectId ? selectedSnapshot : null;

  const analysisSessionId = ANALYSIS_SESSION_ID;

  useEffect(() => {
    let current = true;
    if (!projectId) return () => { current = false; };
    void snapshotsRepo.current.list(projectId).then((items) => {
      if (current && engine.getCurrentProjectId() === projectId) setSnapshots(items);
    }).catch((cause: unknown) => {
      if (current && engine.getCurrentProjectId() === projectId) setSnapshotMessage({ projectId, text: cause instanceof Error ? cause.message : "No se pudieron leer los snapshots." });
    });
    return () => { current = false; };
  }, [projectId]);

  async function saveSnapshot() {
    if (!projectId || !activeSummary) return;
    if (analyzedVersionId !== activeSummary.versionId) {
      setSnapshotMessage({ projectId, text: "Los resultados no corresponden a la versión activa; vuelva a calcularlos antes de guardar." });
      return;
    }
    const results: Record<string, SnapshotValue> = {};
    const parameters: Record<string, SnapshotValue> = {};
    if (desc) { results.description = desc as unknown as SnapshotValue; parameters.description = resultParameters.description; }
    if (freq) { results.frequencies = freq as unknown as SnapshotValue; parameters.frequencies = resultParameters.frequencies; }
    if (chart) { results.chart = chart as unknown as SnapshotValue; parameters.chart = resultParameters.chart; }
    if (corr) { results.correlation = corr as unknown as SnapshotValue; parameters.correlation = resultParameters.correlation; }
    if (findings !== null) { results.findings = findings as unknown as SnapshotValue; parameters.findings = resultParameters.findings; }
    try {
      const snapshot = createAnalysisSnapshot({
        projectId, title: snapshotTitle.trim(),
        source: {
          sessionId: analysisSessionId,
          versionId: activeSummary.versionId,
          sourceId: engine.getActiveSourceId() ?? activeSummary.datasetId,
          datasetName: activeSummary.fileName, rowCount: activeSummary.rows,
          columns: activeSummary.columns.map(({ name, type, nullable }) => ({ name, type, nullable })),
          lineage: captureSnapshotLineage(activeSummary.versionId, projectId, engine.getDatasetVersions().map((version) => ({
            versionId: version.id,
            projectId: version.projectId ?? "",
            name: version.name,
            operationType: version.operationType,
            sourceIds: version.sourceIds,
            parentIds: version.parentIds,
            pipelineId: version.pipelineId,
            executedDefinition: (version.executedDefinition ?? null) as unknown as SnapshotValue,
            rowCount: version.rowCount,
            columns: version.columns,
            stepCount: version.stepCount,
            createdAt: version.createdAt,
          }))),
        },
        parameters, results,
      });
      await snapshotsRepo.current.save(snapshot);
      if (engine.getCurrentProjectId() === projectId) setSnapshots((items) => [snapshot, ...items]);
      setSnapshotTitle("");
      setSnapshotMessage({ projectId, text: "Snapshot guardado en este dispositivo." });
    } catch (cause) {
      setSnapshotMessage({ projectId, text: cause instanceof Error ? cause.message : "No se pudo guardar el snapshot." });
    }
  }

  const applySchema = useCallback((schema: ColumnInfo[]) => {
    const nextRoles = engine.getSemanticRoles();
    const measures = schema.filter((column) => isNumericMeasure(column, nextRoles));
    setColumns(schema);
    setRoles(nextRoles);
    setDesc(null);
    setCorr(null);
    setChart(null);
    setFindings(null);
    setFreq(null);
    setResultParameters({});
    setAnalyzedVersionId(null);
    setYCol((c) => measures.some((item) => item.name === c) ? c : "");
    setCorrA((c) => measures.some((item) => item.name === c) ? c : "");
    setCorrB((c) => measures.some((item) => item.name === c) ? c : "");
    setDescCol((c) => measures.some((item) => item.name === c) ? c : measures[0]?.name ?? "");
    if (schema.length > 0) {
      setFreqCol((c) => schema.some((item) => item.name === c) ? c : schema[0].name);
      setXCol((c) => schema.some((item) => item.name === c) ? c : schema[0].name);
    }
  }, []);

  const load = useCallback(async () => {
    const request = ++revision.current;
    const versionId = engine.getActiveDatasetVersionId();
    setBusy(true);
    setMessage(null);
    try {
      const schema = await engine.getSchema();
      if (request === revision.current && versionId === engine.getActiveDatasetVersionId()) applySchema(schema);
    } catch (cause: unknown) {
      // Se conserva el esquema anterior (si había): el error se muestra
      // junto a los últimos datos, nunca reemplazándolos.
      if (request === revision.current) {
        setColumns([]);
        // Un proyecto sin dataset es el estado vacío normal. Si había una
        // versión activa, el fallo sí corresponde a un error de carga real.
        setMessage(versionId === null ? null : cause instanceof Error ? cause.message : "No se pudo cargar el esquema del dataset activo.");
      }
    } finally {
      if (request === revision.current) setBusy(false);
    }
  }, [applySchema]);

  useEffect(() => {
    // Carga inicial en continuación asíncrona (patrón de fetch permitido).
    const currentRevision = revision;
    void Promise.resolve().then(load);
    const unsubscribe = engine.onChange(() => { void load(); });
    return () => {
      currentRevision.current++;
      unsubscribe();
    };
  }, [load]);

  async function run<T>(task: () => Promise<T>, apply: (v: T) => void) {
    const request = revision.current;
    const versionId = engine.getActiveDatasetVersionId();
    setBusy(true);
    setMessage(null);
    try {
      const result = await task();
      if (request === revision.current && versionId === engine.getActiveDatasetVersionId()) {
        apply(result);
        setAnalyzedVersionId(versionId);
      }
    } catch (cause) {
      if (request === revision.current) setMessage(cause instanceof Error ? cause.message : "Error de análisis");
    } finally {
      if (request === revision.current) setBusy(false);
    }
  }

  async function computeFindings() {
    const request = revision.current;
    const versionId = engine.getActiveDatasetVersionId();
    setBusy(true);
    setMessage(null);
    try {
      const list = [];
      for (const c of columns) {
        if (request !== revision.current) return;
        const profile = await engine.profileColumn(c.name);
        let mean: number | null = null;
        let median: number | null = null;
        let stddev: number | null = null;
        if (isNumericMeasure(c, roles)) {
          try {
            const d = await engine.describeNumeric(c.name);
            mean = d.mean;
            median = d.median;
            stddev = d.stddev;
          } catch {
            // Columna no resumible: solo perfil.
          }
        }
        let topShare: number | null = null;
        try {
          const f = await engine.frequencies(c.name, 1);
          if (f.valid > 0 && f.rows.length > 0) {
            topShare = Math.round((f.rows[0].count / f.valid) * 1000) / 10;
          }
        } catch {
          // Sin frecuencias: se omite la regla.
        }
        list.push({
          column: c.name,
          total: profile.total,
          nullPct: profile.nullPct,
          distinct: profile.distinct,
          mean,
          median,
          stddev,
          topShare,
        });
      }
      if (request === revision.current && versionId === engine.getActiveDatasetVersionId()) {
        setFindings(evaluateFindings(list));
        setAnalyzedVersionId(versionId);
        setResultParameters((current) => ({ ...current, findings: { rulesVersion: 1, columns: columns.map((column) => column.name) } }));
      }
    } catch (cause) {
      if (request === revision.current) setMessage(cause instanceof Error ? cause.message : "Error de análisis");
    } finally {
      if (request === revision.current) setBusy(false);
    }
  }

  async function renderChart() {
    const request = revision.current;
    const versionId = engine.getActiveDatasetVersionId();
    setBusy(true);
    setMessage(null);
    setChart(null);
    try {
      if (chartKind === "hist") {
        if (!yCol) throw new Error("Elija la columna numérica del histograma.");
        const h: Histogram = await engine.histogram(yCol, bins);
        if (request !== revision.current || versionId !== engine.getActiveDatasetVersionId()) return;
        setAnalyzedVersionId(versionId);
        setResultParameters((current) => ({ ...current, chart: { kind: "hist", column: yCol, bins } }));
        setChart({
          title: `Histograma de ${yCol} (${h.bins} bines)`,
          kind: "bar",
          points: h.counts.map((count, i) => ({
            label: h.width === 0 ? `${h.lo}` : `${round2(h.lo + i * h.width)}–${round2(h.lo + (i + 1) * h.width)}`,
            value: count,
          })),
        });
      } else {
        if (!xCol) throw new Error("Elija la columna del eje X.");
        if (agg !== "count" && !yCol) throw new Error("Elija la columna numérica para la agregación.");
        const grouped = await engine.groupedStat(
          xCol,
          agg === "count" ? null : yCol || null,
          agg,
        );
        if (request !== revision.current || versionId !== engine.getActiveDatasetVersionId()) return;
        setAnalyzedVersionId(versionId);
        setResultParameters((current) => ({ ...current, chart: { kind: chartKind, xColumn: xCol, yColumn: yCol, aggregation: agg } }));
        const aggLabel = agg === "count" ? "conteo" : agg === "sum" ? `suma de ${yCol}` : `media de ${yCol}`;
        setChart({
          title: `${chartKind === "bar" ? "Barras" : "Líneas"}: ${aggLabel} por ${xCol} (${grouped.rows.length} grupos${grouped.truncated ? "; se muestran los primeros 500, hay más" : ""})`,
          kind: chartKind,
          points: grouped.rows.map((r) => ({ label: fmtCell(r.x), value: r.y })),
        });
      }
    } catch (cause) {
      if (request === revision.current) setMessage(cause instanceof Error ? cause.message : "Error de análisis");
    } finally {
      if (request === revision.current) setBusy(false);
    }
  }

  if (columns.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[1500px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-violet-700">Workspace / Análisis</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Análisis exploratorio</h1>
            <p className="mt-1 text-slate-600">Explora métricas, distribuciones y relaciones de tus datos.</p>
          </div>
          <button type="button" disabled={busy} onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-800 shadow-sm hover:bg-violet-50 disabled:opacity-50">
            <RefreshCw size={16} aria-hidden="true" /> Actualizar
          </button>
        </header>
        {message ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p> : null}
        <div className="grid gap-4 md:grid-cols-3" aria-label="Resumen del dataset">
          <SummaryCard icon={<Table2 size={21} />} title="Filas" value="—" detail={busy ? "Consultando dataset…" : "Inactivo: importa un dataset para comenzar."} />
          <SummaryCard icon={<ChartNoAxesColumn size={21} />} title="Columnas" value="—" detail={busy ? "Consultando dataset…" : "Inactivo: importa un dataset para comenzar."} />
          <SummaryCard icon={<ShieldCheck size={21} />} title="Calidad de datos" value="—" detail={busy ? "Consultando dataset…" : "Se mostrará al cargar un dataset."} />
        </div>
        <section className="grid min-h-[330px] items-center gap-8 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm md:grid-cols-[minmax(220px,0.8fr)_1.2fr] md:p-10" aria-labelledby="analysis-empty-title">
          <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-[2rem] bg-violet-50 text-violet-700 md:h-56 md:w-56">
            <div className="relative"><BarChart3 size={112} strokeWidth={1.5} aria-hidden="true" /><Sparkles className="absolute -right-5 -top-4" size={30} aria-hidden="true" /></div>
          </div>
          <div className="max-w-xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800"><LockKeyhole size={14} aria-hidden="true" /> Procesamiento local y privado</div>
            <h2 id="analysis-empty-title" className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Tu análisis comienza con un dataset</h2>
            <p className="mt-3 text-base leading-7 text-slate-600">Importa un archivo CSV, XLSX, JSON o Parquet desde Datos para explorar estadísticas, distribuciones y relaciones reales.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={onNavigateToData} disabled={!onNavigateToData} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-800 disabled:cursor-default disabled:opacity-60"><Upload size={17} aria-hidden="true" /> Ir a Datos</button>
              <button type="button" onClick={onTryExample} disabled={!onTryExample} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-default disabled:opacity-60"><Sparkles size={17} aria-hidden="true" /> Probar un ejemplo</button>
            </div>
          </div>
        </section>
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard icon={<Sigma size={21} />} title="Resumen estadístico" text="Consulta métricas numéricas y frecuencias categóricas del dataset." />
          <FeatureCard icon={<Activity size={21} />} title="Distribuciones" text="Explora histogramas y gráficos agrupados con tus columnas." />
          <FeatureCard icon={<Layers3 size={21} />} title="Valores faltantes" text="Revisa perfiles y hallazgos calculados sobre los datos importados." />
        </div>
        <section aria-labelledby="snapshots-empty" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 id="snapshots-empty" className="text-lg font-bold text-slate-900">Snapshots guardados</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Los resultados guardados sobreviven al recargar; los archivos y versiones del motor no. Reimporte el archivo para volver a analizarlo. La reimportación no se vincula automáticamente con snapshots anteriores.</p>
          {visibleSnapshotMessage ? <p role="status">{visibleSnapshotMessage}</p> : null}
          {projectSnapshots.length === 0 ? <p className="mt-3 text-sm text-slate-500">{projectId ? "Todavía no hay snapshots en este proyecto." : "Abre un proyecto para consultar sus snapshots."}</p> : (
            <ul className="space-y-2">
              {projectSnapshots.map((snapshot) => <li key={snapshot.id} className="rounded border p-2 text-sm">
                <button type="button" onClick={() => setSelectedSnapshot(snapshot)} className="font-semibold underline">{snapshot.title}</button>
                <span> · {snapshot.createdAt} · {snapshot.source.datasetName} · fuente no disponible en esta sesión</span>
              </li>)}
            </ul>
          )}
          {visibleSelectedSnapshot ? <div className="rounded bg-gray-50 p-3" aria-label="Resultado guardado">
            <h3 className="font-semibold">{visibleSelectedSnapshot.title}</h3>
            <p>{visibleSelectedSnapshot.source.datasetName}; {visibleSelectedSnapshot.source.rowCount} filas; versión {visibleSelectedSnapshot.source.versionId} (sesión anterior).</p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs" aria-label="Linaje del snapshot">{JSON.stringify(visibleSelectedSnapshot.source.lineage, null, 2)}</pre>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">Parámetros: {JSON.stringify(visibleSelectedSnapshot.parameters, null, 2)}</pre>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(visibleSelectedSnapshot.results, null, 2)}</pre>
            <button type="button" onClick={() => setSelectedSnapshot(null)} className="underline">Cerrar</button>
          </div> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-violet-700">Workspace / Análisis</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Análisis exploratorio</h1>
          <p className="mt-1 text-slate-600">Patrones y métricas calculados sobre los datos de esta sesión.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-800 shadow-sm hover:bg-violet-50 disabled:opacity-50">
          <RefreshCw size={16} aria-hidden="true" /> Actualizar
        </button>
      </header>
      <div className="grid gap-4 md:grid-cols-3" aria-label="Resumen del dataset">
        <SummaryCard icon={<Table2 size={21} />} title="Filas" value={activeSummary?.rows.toLocaleString("es-AR") ?? "—"} detail={activeSummary?.fileName ?? "Dataset activo"} />
        <SummaryCard icon={<ChartNoAxesColumn size={21} />} title="Columnas" value={String(columns.length)} detail={`${measureColumns.length} medidas numéricas`} />
        <SummaryCard icon={<ShieldCheck size={21} />} title="Calidad de datos" value={findings === null ? "Pendiente" : `${findings.length} hallazgos`} detail={findings === null ? "Evalúa reglas para revisar el perfil." : "Resultado de reglas transparentes"} />
      </div>
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
        Dataset: <strong className="text-slate-800">{activeSummary?.fileName ?? "activo"}</strong> · Cálculos sobre {columns.length} columnas. Varianza y desvío muestrales (n−1); cuantiles continuos; nulos excluidos. Las medias, cuantiles, varianzas y correlaciones usan coma flotante y son aproximadas.
      </p>
      {message ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p> : null}

      <section aria-labelledby="desc" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="desc" className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900"><Sigma size={20} className="text-violet-700" aria-hidden="true" /> Estadística descriptiva</h2>
        {measureColumns.length === 0 ? <p>No hay medidas numéricas. Puede cambiar los roles en Datos.</p> : null}
        <p className="text-sm">
          <label htmlFor="desc-col">Columna numérica: </label>
          <select id="desc-col" value={descCol} disabled={busy} onChange={(e) => setDescCol(e.target.value)}
            className="rounded border border-gray-300 px-1 py-0.5">
            <option value="">—</option>
            {measureColumns.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
          </select>{" "}
          <button type="button" disabled={busy || !descCol}
            onClick={() => void run(() => engine.describeNumeric(descCol), (value) => {
              setDesc(value);
              setResultParameters((current) => ({ ...current, description: { column: descCol } }));
            })}
            className="rounded bg-violet-800 px-3 py-1 text-sm font-medium text-white">
            Calcular
          </button>
        </p>
        {desc ? (
          <table className="df-table mt-2">
            <tbody>
              <tr><th scope="row">Válidos / faltantes</th><td>{desc.valid} / {desc.missing}</td></tr>
              <tr><th scope="row">Suma</th><td>{fmt(desc.sum)}</td></tr>
              <tr><th scope="row">Media</th><td>{fmt(desc.mean)}</td></tr>
              <tr><th scope="row">Mediana</th><td>{fmt(desc.median)}</td></tr>
              <tr><th scope="row">Moda</th><td>{desc.mode === null ? "—" : String(desc.mode)}</td></tr>
              <tr><th scope="row">Mínimo / máximo</th><td>{fmt(desc.min)} / {fmt(desc.max)}</td></tr>
              <tr><th scope="row">Rango</th><td>{fmt(desc.range)}</td></tr>
              <tr><th scope="row">Varianza (n−1)</th><td>{fmt(desc.variance)}</td></tr>
              <tr><th scope="row">Desvío (n−1)</th><td>{fmt(desc.stddev)}</td></tr>
              <tr><th scope="row">Q1 / Q3</th><td>{fmt(desc.q1)} / {fmt(desc.q3)}</td></tr>
              <tr><th scope="row">IQR</th><td>{fmt(desc.iqr)}</td></tr>
            </tbody>
          </table>
        ) : null}
      </section>

      <section aria-labelledby="freq" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="freq" className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900"><Table2 size={20} className="text-violet-700" aria-hidden="true" /> Frecuencias</h2>
        <p className="text-sm">
          <label htmlFor="freq-col">Columna: </label>
          <select id="freq-col" value={freqCol} disabled={busy} onChange={(e) => setFreqCol(e.target.value)}
            className="rounded border border-gray-300 px-1 py-0.5">
            {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>{" "}
          <button type="button" disabled={busy || !freqCol}
            onClick={() => void run(() => engine.frequencies(freqCol), (value) => {
              setFreq(value);
              setResultParameters((current) => ({ ...current, frequencies: { column: freqCol } }));
            })}
            className="rounded bg-violet-800 px-3 py-1 text-sm font-medium text-white">
            Calcular
          </button>
        </p>
        {freq ? (
          <table className="df-table mt-2">
            <thead><tr><th scope="col">Valor</th><th scope="col">Apariciones</th><th scope="col">% válidos</th></tr></thead>
            <tbody>
              {freq.rows.map((r, i) => (
                <tr key={i}><td>{fmtCell(r.value)}</td><td>{r.count}</td><td>{r.pct}</td></tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <section aria-labelledby="charts" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="charts" className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900"><BarChart3 size={20} className="text-violet-700" aria-hidden="true" /> Gráficos</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label>Tipo:{" "}
            <select id="chart-kind" value={chartKind} disabled={busy}
              onChange={(e) => setChartKind(e.target.value as "bar" | "line" | "hist")}
              className="rounded border border-gray-300 px-1 py-0.5">
              <option value="bar">Barras</option>
              <option value="line">Líneas</option>
              <option value="hist">Histograma</option>
            </select>
          </label>
          {chartKind === "hist" ? (
            <>
              <label>Columna:{" "}
                <select id="hist-col" value={yCol} disabled={busy} onChange={(e) => setYCol(e.target.value)}
                  className="rounded border border-gray-300 px-1 py-0.5">
                  <option value="">—</option>
                  {measureColumns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </label>
              <label>Bines:{" "}
                <input type="number" min={5} max={50} value={bins} disabled={busy}
                  onChange={(e) => setBins(Number(e.target.value))}
                  className="w-16 rounded border border-gray-300 px-1 py-0.5" />
              </label>
            </>
          ) : (
            <>
              <label>Eje X:{" "}
                <select id="chart-x" value={xCol} disabled={busy} onChange={(e) => setXCol(e.target.value)}
                  className="rounded border border-gray-300 px-1 py-0.5">
                  <option value="">—</option>
                  {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </label>
              <label>Agregado:{" "}
                <select id="chart-agg" value={agg} disabled={busy}
                  onChange={(e) => setAgg(e.target.value as "count" | "sum" | "mean")}
                  className="rounded border border-gray-300 px-1 py-0.5">
                  <option value="count">Conteo</option>
                  <option value="sum">Suma</option>
                  <option value="mean">Media</option>
                </select>
              </label>
              {agg !== "count" ? (
                <label>Columna Y:{" "}
                  <select id="chart-y" value={yCol} disabled={busy} onChange={(e) => setYCol(e.target.value)}
                    className="rounded border border-gray-300 px-1 py-0.5">
                    <option value="">—</option>
                    {measureColumns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </label>
              ) : null}
            </>
          )}
          <button type="button" disabled={busy} onClick={() => void renderChart()}
            className="rounded bg-violet-800 px-3 py-1 font-medium text-white">
            Graficar
          </button>
        </div>
        {chart ? (
          <div className="mt-2">
            <ChartView title={chart.title} kind={chart.kind} points={chart.points} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="corr" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="corr" className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900"><Activity size={20} className="text-violet-700" aria-hidden="true" /> Correlación</h2>
        <p className="text-sm">
          <label htmlFor="corr-a">Columna A: </label>
          <select id="corr-a" value={corrA} disabled={busy} onChange={(e) => setCorrA(e.target.value)}
            className="rounded border border-gray-300 px-1 py-0.5">
            <option value="">—</option>
            {measureColumns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>{" "}
          <label htmlFor="corr-b">Columna B: </label>
          <select id="corr-b" value={corrB} disabled={busy} onChange={(e) => setCorrB(e.target.value)}
            className="rounded border border-gray-300 px-1 py-0.5">
            <option value="">—</option>
            {measureColumns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>{" "}
          <button type="button" disabled={busy || !corrA || !corrB}
            onClick={() => void run(() => engine.correlation(corrA, corrB), (value) => {
              setCorr(value);
              setResultParameters((current) => ({ ...current, correlation: { columnA: corrA, columnB: corrB, method: "pearson" } }));
            })}
            className="rounded bg-violet-800 px-3 py-1 text-sm font-medium text-white">
            Calcular r
          </button>
        </p>
        {corr ? (
          <p className="mt-1 text-sm">
            r de Pearson ({corr.colA}, {corr.colB}) = <strong>{corr.r === null ? "no calculable" : corr.r}</strong>{" "}
            con {corr.pairs} pares válidos. Correlación no implica causalidad.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="findings" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="findings" className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900"><CircleHelp size={20} className="text-violet-700" aria-hidden="true" /> Hallazgos</h2>
        <p>
          <button type="button" disabled={busy} onClick={() => void computeFindings()}
            className="rounded bg-violet-800 px-3 py-1 text-sm font-medium text-white">
            Evaluar reglas
          </button>
        </p>
        {findings === null ? null : findings.length === 0 ? (
          <p role="status" className="text-sm">Sin hallazgos bajo los umbrales.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {findings.map((f, i) => (
              <li key={i}><strong>[{f.rule}]</strong> {f.text}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="snapshots" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="snapshots" className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900"><FileChartColumn size={20} className="text-violet-700" aria-hidden="true" /> Snapshots del análisis</h2>
        <p className="mb-2 text-sm text-gray-600">Guarda los resultados calculados y su referencia a la versión activa. Los archivos y las versiones del motor siguen disponibles solo durante esta sesión.</p>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="snapshot-title">Nombre: </label>
          <input id="snapshot-title" value={snapshotTitle} maxLength={120} onChange={(event) => setSnapshotTitle(event.target.value)} className="rounded border px-2 py-1" placeholder="Análisis de ventas" />
          <button type="button" disabled={!projectId || !activeSummary || analyzedVersionId !== activeSummary.versionId || !snapshotTitle.trim() || ![desc, freq, chart, corr, findings].some((result) => result !== null)} onClick={() => void saveSnapshot()} className="rounded bg-violet-800 px-3 py-1 text-sm font-medium text-white">Guardar snapshot</button>
        </div>
        {!projectId ? <p className="text-sm">Abra un proyecto para guardar snapshots.</p> : null}
        {visibleSnapshotMessage ? <p role="status" className="text-sm">{visibleSnapshotMessage}</p> : null}
        {projectSnapshots.length === 0 ? <p className="text-sm">Todavía no hay snapshots en este proyecto.</p> : (
          <ul className="mt-2 space-y-2">
            {projectSnapshots.map((snapshot) => {
              const sourceAvailable = Boolean(analysisSessionId) && snapshot.source.sessionId === analysisSessionId && engine.getDatasetVersions().some((version) => version.id === snapshot.source.versionId && version.projectId === snapshot.projectId && version.sourceId === snapshot.source.sourceId);
              return <li key={snapshot.id} className="rounded border p-2 text-sm">
                <button type="button" onClick={() => setSelectedSnapshot(snapshot)} className="font-semibold underline">{snapshot.title}</button>
                <span> · {snapshot.createdAt} · {snapshot.source.datasetName} · {sourceAvailable ? "fuente disponible en esta sesión" : "fuente no disponible; reimportar no la vincula automáticamente"}</span>
              </li>;
            })}
          </ul>
        )}
        {visibleSelectedSnapshot ? <div className="mt-3 rounded bg-gray-50 p-3" aria-label="Resultado guardado">
          <div className="flex justify-between"><h3 className="font-semibold">{visibleSelectedSnapshot.title}</h3><button type="button" onClick={() => setSelectedSnapshot(null)} className="underline">Cerrar</button></div>
          <p>Dataset: {visibleSelectedSnapshot.source.datasetName}; {visibleSelectedSnapshot.source.rowCount} filas; versión {visibleSelectedSnapshot.source.versionId}.</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs" aria-label="Linaje del snapshot">{JSON.stringify(visibleSelectedSnapshot.source.lineage, null, 2)}</pre>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">Parámetros: {JSON.stringify(visibleSelectedSnapshot.parameters, null, 2)}</pre>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(visibleSelectedSnapshot.results, null, 2)}</pre>
          <button type="button" onClick={() => {
            if (!projectId) return;
            void snapshotsRepo.current.delete(projectId, visibleSelectedSnapshot.id).then(() => {
              if (engine.getCurrentProjectId() === projectId) setSnapshots((items) => items.filter((item) => item.id !== visibleSelectedSnapshot.id));
              setSelectedSnapshot(null);
            }).catch((cause: unknown) => setSnapshotMessage({ projectId, text: cause instanceof Error ? cause.message : "No se pudo eliminar." }));
          }} className="mt-2 text-red-700 underline">Eliminar snapshot</button>
        </div> : null}
      </section>
    </main>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function SummaryCard({ icon, title, value, detail }: { icon: React.ReactNode; title: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          <p className="mt-1 truncate text-2xl font-bold tracking-tight text-slate-900" title={value}>{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500" title={detail}>{detail}</p>
        </div>
      </div>
    </article>
  );
}

function FeatureCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700" aria-hidden="true">{icon}</span>
        <div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-600">{text}</p></div>
      </div>
    </article>
  );
}
