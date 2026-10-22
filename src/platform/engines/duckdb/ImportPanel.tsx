"use client";

import { useEffect, useRef, useState } from "react";
import type { DatasetSource } from "../../../modules/datasets";
import type { ResultRow } from "./contract";
import { DEFAULT_PAGE_SIZE } from "./csv";
import FilterSort from "./FilterSort";
import {
  engine,
  type ColumnInfo,
  type DataFilter,
  type DataSort,
  type ImportSummary,
  type NumericSummary,
} from "./manager";
import ProfileView from "./ProfileView";
import { suggestRole, ROLES, type SemanticRole } from "./semantics";
import { XLSXBridge, type SheetInfo } from "./xlsx-bridge";

export interface ExampleRequest {
  url: string;
  name: string;
  nonce: number;
}

type Phase = "empty" | "importing" | "result" | "error";

interface State {
  phase: Phase;
  summary: ImportSummary | null;
  page: number;
  rows: ResultRow[];
  total: number;
  filtered: number;
  numericColumn: string;
  numeric: NumericSummary | null;
  message: string | null;
}

const initial: State = {
  phase: "empty",
  summary: null,
  page: 1,
  rows: [],
  total: 0,
  filtered: 0,
  numericColumn: "",
  numeric: null,
  message: null,
};

function firstNumeric(columns: ColumnInfo[]): string {
  const fractional = columns.find((c) =>
    /DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL/i.test(c.type),
  );
  if (fractional) return fractional.name;
  const found = columns.find((c) =>
    /INT|UBIGINT|BIGINT|SMALLINT|TINYINT|HUGEINT/i.test(c.type),
  );
  return found ? found.name : "";
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  return String(value);
}

function defaultRoles(columns: ColumnInfo[]): Record<string, SemanticRole> {
  const roles: Record<string, SemanticRole> = {};
  for (const c of columns) roles[c.name] = suggestRole(c.type, c.name);
  return roles;
}

// Explorador de datos (E3–E4): importar, esquema con roles editables,
// filtros y orden sobre el dataset completo, preview paginada, perfilado
// y agregación. Detectar no es limpiar (R2). Sin SQL arbitraria.
export default function ImportPanel({
  example,
  projectId,
}: {
  example?: ExampleRequest | null;
  projectId: string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [st, setSt] = useState<State>(initial);
  const [busy, setBusy] = useState(false);
  const [sheets, setSheets] = useState<SheetInfo[] | null>(null);
  const [sheet, setSheet] = useState("");
  const [probe, setProbe] = useState<string | null>(null);
  const [delimiter, setDelimiter] = useState<"auto" | "," | ";">("auto");
  const [header, setHeader] = useState(true);
  const [filters, setFilters] = useState<DataFilter[]>([]);
  const [sort, setSort] = useState<DataSort | null>(null);
  const [roles, setRoles] = useState<Record<string, SemanticRole>>({});
  const [datasetSnapshot, setDatasetSnapshot] = useState(() => ({
    projectId: engine.getCurrentProjectId(),
    sources: engine.getDatasetSources(),
    activeSourceId: engine.getActiveSourceId(),
    activeVersionId: engine.getActiveDatasetVersionId(),
  }));
  const bridgeRef = useRef<XLSXBridge | null>(null);
  const summaryVersionRef = useRef<string | null>(null);

  const totalPages =
    st.filtered > 0 ? Math.max(1, Math.ceil(st.filtered / DEFAULT_PAGE_SIZE)) : 1;

  // Ejemplo ficticio pedido desde Inicio (misma ruta general, idempotente).
  useEffect(() => {
    if (!example) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setSheets(null);
      setSt((s) => ({ ...s, phase: "importing", message: null }));
      try {
        const res = await fetch(example.url);
        if (!res.ok) throw new Error(`Ejemplo no disponible (HTTP ${res.status})`);
        const downloaded = new File([await res.blob()], example.name, {
          type: "text/csv",
        });
        if (!cancelled) {
          setFile(downloaded);
          if (engine.getStatus() !== "ready") await engine.init();
          if (!cancelled) {
            const summary = await engine.importCSV(downloaded, { projectId });
            if (!cancelled) await showResult(summary);
          }
        }
      } catch (cause) {
        if (!cancelled) fail(cause);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [example, projectId]);

  async function showResult(summary: ImportSummary) {
    summaryVersionRef.current = summary.versionId;
    const numericColumn = firstNumeric(summary.columns);
    const [page, numeric] = await Promise.all([
      engine.getPage(1, DEFAULT_PAGE_SIZE),
      numericColumn ? engine.summarizeNumeric(numericColumn) : Promise.resolve(null),
    ]);
    setFilters([]);
    setSort(null);
    setRoles(defaultRoles(summary.columns));
    setSt({
      phase: "result",
      summary,
      page: 1,
      rows: page.rows,
      total: page.total,
      filtered: page.filtered,
      numericColumn,
      numeric,
      message: null,
    });
  }

  useEffect(() => {
    const loadActiveSummary = async (summary: ImportSummary) => {
      summaryVersionRef.current = summary.versionId;
      const numericColumn = firstNumeric(summary.columns);
      const [page, numeric] = await Promise.all([
        engine.getPage(1, DEFAULT_PAGE_SIZE),
        numericColumn ? engine.summarizeNumeric(numericColumn) : Promise.resolve(null),
      ]);
      setFilters([]);
      setSort(null);
      setRoles(defaultRoles(summary.columns));
      setSt({
        phase: "result",
        summary,
        page: 1,
        rows: page.rows,
        total: page.total,
        filtered: page.filtered,
        numericColumn,
        numeric,
        message: null,
      });
    };
    const sync = () => {
      setDatasetSnapshot({
        projectId: engine.getCurrentProjectId(),
        sources: engine.getDatasetSources(),
        activeSourceId: engine.getActiveSourceId(),
        activeVersionId: engine.getActiveDatasetVersionId(),
      });
      const current = engine.getActiveDatasetSummary();
      if (current && current.versionId !== summaryVersionRef.current) {
        void loadActiveSummary(current).catch((cause: unknown) => {
          setSt((previous) => ({ ...previous, phase: "error", message: cause instanceof Error ? cause.message : "No se pudo activar el dataset." }));
        });
      } else if (!current && summaryVersionRef.current !== null) {
        summaryVersionRef.current = null;
        setSt(initial);
        setFilters([]);
        setSort(null);
        setRoles({});
      }
    };
    const unsubscribe = engine.onChange(sync);
    const active = engine.getActiveDatasetSummary();
    if (active) {
      void loadActiveSummary(active).catch((cause: unknown) => {
        setSt((previous) => ({ ...previous, phase: "error", message: cause instanceof Error ? cause.message : "No se pudo recuperar el dataset activo." }));
      });
    }
    return unsubscribe;
  }, []);

  function fail(cause: unknown) {
    const message =
      cause instanceof Error
        ? cause.message
        : typeof cause === "object" && cause !== null && "message" in cause
          ? String((cause as { message: unknown }).message)
          : "Error desconocido";
    setSt((s) => ({ ...s, phase: "error", message }));
  }

  async function doImport(target: File) {
    setBusy(true);
    setSheets(null);
    setSt((s) => ({ ...s, phase: "importing", message: null }));
    try {
      const lower = target.name.toLowerCase();
      if (lower.endsWith(".xlsx")) {
        const bridge = new XLSXBridge();
        bridgeRef.current?.dispose();
        bridgeRef.current = bridge;
        const found = await bridge.list(target);
        if (found.length === 0) throw new Error("El XLSX no contiene hojas.");
        setSheets(found);
        setSheet(found[0].name);
        setSt((s) => ({ ...s, phase: "empty", message: null }));
      } else if (lower.endsWith(".csv")) {
        await showResult(await engine.importCSV(target, { delimiter, header, projectId }));
      } else if (lower.endsWith(".json")) {
        await showResult(await engine.importJSON(target, { projectId }));
      } else if (lower.endsWith(".parquet")) {
        await showResult(await engine.importParquet(target, { projectId }));
      } else {
        throw new Error("Tipo no soportado: solo .csv, .xlsx, .json tabular y .parquet.");
      }
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function doImportSheet() {
    const bridge = bridgeRef.current;
    if (!bridge || !file || !sheet) return;
    setBusy(true);
    setSt((s) => ({ ...s, phase: "importing", message: null }));
    try {
      const extracted = await bridge.extract(sheet);
      await showResult(
        await engine.importCSVText(`${file.name}#${extracted.sheet}`, extracted.csv, { projectId }),
      );
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function loadPage(page: number, nextFilters: DataFilter[], nextSort: DataSort | null) {
    const summary = st.summary;
    if (!summary) return;
    const pages = Math.max(1, Math.ceil(st.filtered / DEFAULT_PAGE_SIZE));
    const p = Math.min(Math.max(1, page), pages);
    setBusy(true);
    try {
      const result = await engine.getPage(p, DEFAULT_PAGE_SIZE, {
        filters: nextFilters,
        sort: nextSort,
      });
      setSt((s) => ({ ...s, page: p, rows: result.rows, filtered: result.filtered }));
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function changeNumeric(column: string) {
    if (!column) {
      setSt((s) => ({ ...s, numericColumn: "", numeric: null }));
      return;
    }
    setBusy(true);
    try {
      const numeric = await engine.summarizeNumeric(column);
      setSt((s) => ({ ...s, numericColumn: column, numeric }));
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function doProbe() {
    setBusy(true);
    try {
      const res = await fetch("demo-data/sonda.xlsx");
      if (!res.ok) throw new Error(`Sonda no disponible (HTTP ${res.status})`);
      const verdict = await engine.probeXLSXNative(
        new Uint8Array(await res.arrayBuffer()),
      );
      setProbe(
        `Lectura nativa (read_xlsx): ${verdict.supported ? "soportada" : "no soportada"} — ${verdict.detail}`,
      );
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function activateSource(source: DatasetSource) {
    setBusy(true);
    try {
      await engine.activateDatasetVersion(source.id);
      const summary = engine.getActiveDatasetSummary();
      if (!summary) throw new Error("No se pudo recuperar la fuente seleccionada.");
      await showResult(summary);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function removeSource(source: DatasetSource) {
    if (!window.confirm(`¿Quitar «${source.name}» de esta sesión? Se eliminarán sus versiones derivadas.`)) return;
    setBusy(true);
    try {
      await engine.removeDataset(source.id);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  const isCSV = file !== null && file.name.toLowerCase().endsWith(".csv");
  const visibleSources = datasetSnapshot.projectId === projectId ? datasetSnapshot.sources : [];
  const activeSourceId = datasetSnapshot.projectId === projectId ? datasetSnapshot.activeSourceId : null;
  const activeVersionId = datasetSnapshot.projectId === projectId ? datasetSnapshot.activeVersionId : null;

  return (
    <section aria-labelledby="importar">
      <h2 id="importar">Importar y explorar (E3–E4)</h2>
      <p>
        CSV (UTF-8, delimitador coma/punto y coma, con o sin encabezados),
        XLSX (hojas tabulares vía Worker), JSON tabular (arreglo de objetos) y
        Parquet. Límites orientativos: 20 MB para CSV/JSON/Parquet; 10 MB comprimidos y 64 MiB de expansión para XLSX. Sin
        codificaciones alternativas ni corrección silenciosa: lo no soportado se
        informa. Selección de columnas y cambio de tipos son transformaciones (R2).
      </p>
      <section className="my-4 space-y-2 rounded border border-gray-200 bg-white p-3" aria-labelledby="datasets-sesion">
        <h3 id="datasets-sesion" className="font-semibold">Datasets de este proyecto en la sesión</h3>
        <p className="text-sm text-gray-600">Las fuentes se mantienen en memoria hasta cerrar o recargar. Puede importar más de una; quitar una fuente también elimina sus versiones derivadas.</p>
        {visibleSources.length === 0 ? (
          <p className="text-sm text-gray-600">No hay fuentes cargadas en este proyecto durante la sesión.</p>
        ) : (
          <ul className="space-y-1">
            {visibleSources.map((source) => (
              <li key={source.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  {source.name} · {source.rowCount} filas · {source.columns.length} columnas
                  {source.id === activeSourceId ? " (activa)" : ""}
                </span>
                <button
                  type="button"
                  disabled={busy || activeVersionId === source.id}
                  onClick={() => void activateSource(source)}
                  className="underline"
                >
                  {source.id === activeSourceId ? "Usar fuente original" : "Activar dataset"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeSource(source)}
                  className="text-red-700 underline"
                >
                  Quitar de la sesión
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p>
        <label htmlFor="csv-file">Elegir archivo: </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,.xlsx,.json,.parquet,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setSheets(null);
          }}
        />{" "}
        <button
          type="button"
          disabled={busy || !file}
          onClick={() => file && void doImport(file)}
        >
          Importar archivo
        </button>
      </p>
      {isCSV ? (
        <p className="flex flex-wrap gap-3 text-sm">
          <label>
            Delimitador:{" "}
            <select
              value={delimiter}
              disabled={busy}
              onChange={(e) => setDelimiter(e.target.value as "auto" | "," | ";")}
              className="rounded border border-gray-300 px-1 py-0.5"
            >
              <option value="auto">Automático (coma o punto y coma)</option>
              <option value=",">Coma</option>
              <option value=";">Punto y coma</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={header}
              disabled={busy}
              onChange={(e) => setHeader(e.target.checked)}
            />{" "}
            Primera fila con encabezados
          </label>
        </p>
      ) : null}

      {sheets && sheets.length > 0 ? (
        <p>
          <label htmlFor="sheet">Hoja: </label>
          <select
            id="sheet"
            value={sheet}
            disabled={busy}
            onChange={(e) => setSheet(e.target.value)}
          >
            {sheets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.rows}×{s.cols})
              </option>
            ))}
          </select>{" "}
          <button
            type="button"
            disabled={busy || !sheet}
            onClick={() => void doImportSheet()}
          >
            Importar hoja
          </button>
        </p>
      ) : null}

      <p>
        <button type="button" disabled={busy} onClick={() => void doProbe()}>
          Probar lectura nativa XLSX
        </button>
      </p>
      {probe ? <p role="status">{probe}</p> : null}

      {st.phase === "empty" && !sheets ? (
        <p role="status">Sin dataset: elija un archivo e impórtelo.</p>
      ) : null}
      {st.phase === "importing" ? <p role="status">Importando y consultando…</p> : null}
      {st.phase === "error" && st.message ? (
        <p role="alert">
          {st.message} — el dataset anterior (si había, se muestra abajo)
          sigue intacto; puede importar otro archivo.
        </p>
      ) : null}

      {st.summary && st.phase !== "importing" && st.phase !== "empty" ? (
        <>
          <p role="status">
            {st.summary.fileName}: {st.summary.rows} filas,{" "}
            {st.summary.columns.length} columnas, {st.summary.bytes} bytes
            importados en {st.summary.durationMs} ms (motor).
          </p>

          <h3>Esquema y roles semánticos</h3>
          <table className="df-table">
            <thead>
              <tr>
                <th scope="col">Columna</th>
                <th scope="col">Tipo</th>
                <th scope="col">Rol</th>
                <th scope="col">Nulos</th>
              </tr>
            </thead>
            <tbody>
              {st.summary.columns.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{c.type}</td>
                  <td>
                    <select
                      aria-label={`Rol semántico de ${c.name}`}
                      value={roles[c.name] ?? "desconocido"}
                      disabled={busy}
                      onChange={(e) =>
                        setRoles((r) => ({ ...r, [c.name]: e.target.value as (typeof ROLES)[number] }))
                      }
                      className="rounded border border-gray-300 px-1 py-0.5 text-sm"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>{c.nullable ? "sí" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Filtros y orden</h3>
          <FilterSort
            key={st.summary.fileName}
            columns={st.summary.columns}
            busy={busy}
            onApply={(f, s) => {
              setFilters(f);
              setSort(s);
              void loadPage(1, f, s);
            }}
            onClear={() => {
              setFilters([]);
              setSort(null);
              void loadPage(1, [], null);
            }}
          />

          <h3>
            Vista previa (página {st.page} de {totalPages} · {st.filtered} de{" "}
            {st.total} filas)
          </h3>
          <table className="df-table">
            <thead>
              <tr>
                {st.summary.columns.map((c) => (
                  <th key={c.name} scope="col">{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {st.rows.map((row, i) => (
                <tr key={i}>
                  {st.summary!.columns.map((c) => (
                    <td key={c.name}>{formatCell(row[c.name])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <button
              type="button"
              disabled={busy || st.page <= 1}
              onClick={() => void loadPage(st.page - 1, filters, sort)}
            >
              Anterior
            </button>{" "}
            <button
              type="button"
              disabled={busy || st.page >= totalPages}
              onClick={() => void loadPage(st.page + 1, filters, sort)}
            >
              Siguiente
            </button>
          </p>

          <h3>Perfilado de calidad</h3>
          <ProfileView key={`p-${st.summary.fileName}`} columns={st.summary.columns} />

          <h3>Agregación</h3>
          <p>
            <label htmlFor="num-col">Columna numérica: </label>
            <select
              id="num-col"
              value={st.numericColumn}
              disabled={busy}
              onChange={(e) => void changeNumeric(e.target.value)}
            >
              <option value="">—</option>
              {st.summary.columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </p>
          {st.numeric ? (
            <ul>
              <li>Válidos: {st.numeric.count}</li>
              <li>Suma: {st.numeric.sum}</li>
              <li>Media: {st.numeric.avg}</li>
              <li>Mínimo: {st.numeric.min}</li>
              <li>Máximo: {st.numeric.max}</li>
            </ul>
          ) : (
            <p>Sin columna numérica seleccionada.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
