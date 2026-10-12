"use client";

import { useRef, useState } from "react";
import type { ResultRow } from "./contract";
import {
  DEFAULT_PAGE_SIZE,
} from "./csv";
import {
  engine,
  type ColumnInfo,
  type ImportSummary,
  type NumericSummary,
} from "./manager";
import { XLSXBridge, type SheetInfo } from "./xlsx-bridge";

type Phase =
  | "empty"
  | "importing"
  | "result"
  | "error";

interface State {
  phase: Phase;
  summary: ImportSummary | null;
  page: number;
  rows: ResultRow[];
  numericColumn: string;
  numeric: NumericSummary | null;
  message: string | null;
}

const initial: State = {
  phase: "empty",
  summary: null,
  page: 1,
  rows: [],
  numericColumn: "",
  numeric: null,
  message: null,
};

function firstNumeric(columns: ColumnInfo[]): string {
  // Por defecto, una columna fraccionaria (caso típico a resumir);
  // si no hay, la primera numérica disponible.
  const fractional = columns.find((c) =>
    /DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL/i.test(c.type),
  );
  if (fractional) return fractional.name;
  const found = columns.find((c) => /INT|UBIGINT|BIGINT|SMALLINT|TINYINT|HUGEINT/i.test(c.type));
  return found ? found.name : "";
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return String(value);
  return String(value);
}

export default function ImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [st, setSt] = useState<State>(initial);
  const [busy, setBusy] = useState(false);
  const [sheets, setSheets] = useState<SheetInfo[] | null>(null);
  const [sheet, setSheet] = useState("");
  const [probe, setProbe] = useState<string | null>(null);
  const bridgeRef = useRef<XLSXBridge | null>(null);

  const totalPages =
    st.summary && st.summary.rows > 0
      ? Math.max(1, Math.ceil(st.summary.rows / DEFAULT_PAGE_SIZE))
      : 1;

  async function showResult(summary: ImportSummary) {
    const numericColumn = firstNumeric(summary.columns);
    const [rows, numeric] = await Promise.all([
      engine.getPage(1, DEFAULT_PAGE_SIZE),
      numericColumn
        ? engine.summarizeNumeric(numericColumn)
        : Promise.resolve(null),
    ]);
    setSt({
      phase: "result",
      summary,
      page: 1,
      rows,
      numericColumn,
      numeric,
      message: null,
    });
  }

  async function doImport(target: File) {
    setBusy(true);
    setSheets(null);
    setSt((s) => ({ ...s, phase: "importing", message: null }));
    try {
      if (target.name.toLowerCase().endsWith(".xlsx")) {
        // Ruta B (0A.4): parser JS en Worker → CSV → importador general.
        const bridge = new XLSXBridge();
        bridgeRef.current?.dispose();
        bridgeRef.current = bridge;
        const found = await bridge.list(target);
        if (found.length === 0) {
          throw new Error("El XLSX no contiene hojas.");
        }
        setSheets(found);
        setSheet(found[0].name);
        setSt((s) => ({ ...s, phase: "empty", message: null }));
      } else {
        const summary = await engine.importCSV(target);
        await showResult(summary);
      }
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : (cause as { message?: string })?.message ?? "Error desconocido";
      setSt((s) => ({ ...s, phase: "error", message }));
    } finally {
      setBusy(false);
    }
  }

  async function doProbe() {
    setBusy(true);
    try {
      // Sonda de ruta A (0A.4) con fixture mínimo versionado.
      const res = await fetch("demo-data/sonda.xlsx");
      if (!res.ok) throw new Error(`Sonda no disponible (HTTP ${res.status})`);
      const verdict = await engine.probeXLSXNative(
        new Uint8Array(await res.arrayBuffer()),
      );
      setProbe(
        `Lectura nativa (read_xlsx): ${verdict.supported ? "soportada" : "no soportada"} — ${verdict.detail}`,
      );
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Error en la sonda";
      setSt((s) => ({ ...s, message }));
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
      const summary = await engine.importCSVText(
        `${file.name}#${extracted.sheet}`,
        extracted.csv,
      );
      await showResult(summary);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : (cause as { message?: string })?.message ?? "Error desconocido";
      setSt((s) => ({ ...s, phase: "error", message }));
    } finally {
      setBusy(false);
    }
  }

  async function goTo(page: number) {
    const p = Math.min(Math.max(1, page), totalPages);
    setBusy(true);
    try {
      const rows = await engine.getPage(p, DEFAULT_PAGE_SIZE);
      setSt((s) => ({ ...s, page: p, rows }));
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Error al paginar";
      setSt((s) => ({ ...s, phase: "error", message }));
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
      const message =
        cause instanceof Error ? cause.message : "Error al agregar";
      setSt((s) => ({ ...s, message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="importar">
      <h2 id="importar">Importar CSV/XLSX (0A.3–0A.4)</h2>
      <p>
        CSV: UTF-8, con encabezados, coma o punto y coma (autodetectado),
        campos entrecomillados, límite 20 MB. XLSX: hojas tabulares vía parser
        en Worker (ruta B), límite 10 MB comprimido; no se ejecutan fórmulas
        (se usa el valor almacenado) y las fechas pueden llegar como número de
        serie. Aún no soportado: otras codificaciones, sin encabezados, otros
        delimitadores, JSON/Parquet. El archivo original no se modifica; la
        tabla en memoria se reemplaza al importar otro archivo.
      </p>
      <p>
        <label htmlFor="csv-file">Elegir archivo: </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
      {st.phase === "importing" ? (
        <p role="status">Importando y consultando…</p>
      ) : null}
      {st.phase === "error" && st.message ? (
        <p role="alert">
          {st.message} — el dataset anterior (si había) sigue intacto; puede
          importar otro archivo.
        </p>
      ) : null}

      {st.phase === "result" && st.summary ? (
        <>
          <p role="status">
            {st.summary.fileName}: {st.summary.rows} filas,{" "}
            {st.summary.columns.length} columnas, {st.summary.bytes} bytes
            importados en {st.summary.durationMs} ms (motor).
          </p>
          <h3>Esquema</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">Columna</th>
                <th scope="col">Tipo</th>
                <th scope="col">Nulos</th>
              </tr>
            </thead>
            <tbody>
              {st.summary.columns.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{c.type}</td>
                  <td>{c.nullable ? "sí" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>

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

          <h3>
            Vista previa (página {st.page} de {totalPages})
          </h3>
          <table>
            <thead>
              <tr>
                {st.summary.columns.map((c) => (
                  <th key={c.name} scope="col">
                    {c.name}
                  </th>
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
              onClick={() => void goTo(st.page - 1)}
            >
              Anterior
            </button>{" "}
            <button
              type="button"
              disabled={busy || st.page >= totalPages}
              onClick={() => void goTo(st.page + 1)}
            >
              Siguiente
            </button>
          </p>
        </>
      ) : null}
    </section>
  );
}
