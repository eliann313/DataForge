"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { evaluateFindings, type Finding } from "@/modules/analysis";
import {
  engine,
  type ColumnInfo,
  type Correlation,
  type FrequencyTable,
  type GroupedRow,
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

// Vista Análisis (E5): descriptivos verificables, frecuencias, gráficos sobre
// agregados, correlación justificada y hallazgos por reglas transparentes.
export default function AnalysisView() {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
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

  async function fetchSchema(): Promise<ColumnInfo[]> {
    return engine.getSchema();
  }

  async function applySchema(schema: ColumnInfo[]) {
    setColumns(schema);
    if (schema.length > 0) {
      setDescCol((c) => c || schema[0].name);
      setFreqCol((c) => c || schema[0].name);
      setXCol((c) => c || schema[0].name);
    }
  }

  async function load() {
    setBusy(true);
    setMessage(null);
    try {
      await applySchema(await fetchSchema());
    } catch {
      // Se conserva el esquema anterior (si había): el error se muestra
      // junto a los últimos datos, nunca reemplazándolos.
      setMessage("Sin dataset: importe un archivo en Datos primero.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Carga inicial en continuación asíncrona (patrón de fetch permitido).
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const schema = await fetchSchema();
        if (!cancelled) await applySchema(schema);
      } catch {
        if (!cancelled) {
          setMessage("Sin dataset: importe un archivo en Datos primero.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run<T>(task: () => Promise<T>, apply: (v: T) => void) {
    setBusy(true);
    setMessage(null);
    try {
      apply(await task());
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Error de análisis");
    } finally {
      setBusy(false);
    }
  }

  async function computeFindings() {
    setBusy(true);
    setMessage(null);
    try {
      const list = [];
      for (const c of columns) {
        const profile = await engine.profileColumn(c.name);
        let mean: number | null = null;
        let median: number | null = null;
        let stddev: number | null = null;
        if (/INT|DOUBLE|FLOAT|DECIMAL|NUMERIC|REAL/i.test(c.type)) {
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
      setFindings(evaluateFindings(list));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Error de análisis");
    } finally {
      setBusy(false);
    }
  }

  async function renderChart() {
    setBusy(true);
    setMessage(null);
    try {
      if (chartKind === "hist") {
        if (!yCol) throw new Error("Elija la columna numérica del histograma.");
        const h: Histogram = await engine.histogram(yCol, bins);
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
        const rows: GroupedRow[] = await engine.groupedStat(
          xCol,
          agg === "count" ? null : yCol || null,
          agg,
        );
        const aggLabel = agg === "count" ? "conteo" : agg === "sum" ? `suma de ${yCol}` : `media de ${yCol}`;
        setChart({
          title: `${chartKind === "bar" ? "Barras" : "Líneas"}: ${aggLabel} por ${xCol} (${rows.length} grupos)`,
          kind: chartKind,
          points: rows.map((r) => ({ label: fmtCell(r.x), value: r.y })),
        });
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Error de análisis");
    } finally {
      setBusy(false);
    }
  }

  if (columns.length === 0) {
    return (
      <div className="space-y-2">
        <p role="status">
          {message ?? "Cargando dataset…"}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="rounded bg-violet-800 px-3 py-1 text-sm font-medium text-white"
        >
          Actualizar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Cálculos sobre el dataset activo ({columns.length} columnas). Varianza y
        desvío muestrales (n−1); cuantiles continuos; nulos excluidos.{" "}
        <button type="button" disabled={busy} onClick={() => void load()} className="underline">
          Actualizar dataset
        </button>
      </p>
      {message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}

      <section aria-labelledby="desc">
        <h2 id="desc" className="mb-1 text-lg font-bold">Estadística descriptiva</h2>
        <p className="text-sm">
          <label htmlFor="desc-col">Columna numérica: </label>
          <select id="desc-col" value={descCol} disabled={busy} onChange={(e) => setDescCol(e.target.value)}
            className="rounded border border-gray-300 px-1 py-0.5">
            {columns.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
          </select>{" "}
          <button type="button" disabled={busy || !descCol}
            onClick={() => void run(() => engine.describeNumeric(descCol), setDesc)}
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

      <section aria-labelledby="freq">
        <h2 id="freq" className="mb-1 text-lg font-bold">Frecuencias</h2>
        <p className="text-sm">
          <label htmlFor="freq-col">Columna: </label>
          <select id="freq-col" value={freqCol} disabled={busy} onChange={(e) => setFreqCol(e.target.value)}
            className="rounded border border-gray-300 px-1 py-0.5">
            {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>{" "}
          <button type="button" disabled={busy || !freqCol}
            onClick={() => void run(() => engine.frequencies(freqCol), setFreq)}
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

      <section aria-labelledby="charts">
        <h2 id="charts" className="mb-1 text-lg font-bold">Gráficos</h2>
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
                  {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
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
                    {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
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

      <section aria-labelledby="corr">
        <h2 id="corr" className="mb-1 text-lg font-bold">Correlación</h2>
        <p className="text-sm">
          <label htmlFor="corr-a">Columna A: </label>
          <select id="corr-a" value={corrA} disabled={busy} onChange={(e) => setCorrA(e.target.value)}
            className="rounded border border-gray-300 px-1 py-0.5">
            <option value="">—</option>
            {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>{" "}
          <label htmlFor="corr-b">Columna B: </label>
          <select id="corr-b" value={corrB} disabled={busy} onChange={(e) => setCorrB(e.target.value)}
            className="rounded border border-gray-300 px-1 py-0.5">
            <option value="">—</option>
            {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>{" "}
          <button type="button" disabled={busy || !corrA || !corrB}
            onClick={() => void run(() => engine.correlation(corrA, corrB), setCorr)}
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

      <section aria-labelledby="findings">
        <h2 id="findings" className="mb-1 text-lg font-bold">Hallazgos</h2>
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
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
