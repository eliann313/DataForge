"use client";

import { useState } from "react";
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

  const totalPages =
    st.summary && st.summary.rows > 0
      ? Math.max(1, Math.ceil(st.summary.rows / DEFAULT_PAGE_SIZE))
      : 1;

  async function doImport(target: File) {
    setBusy(true);
    setSt((s) => ({ ...s, phase: "importing", message: null }));
    try {
      const summary = await engine.importCSV(target);
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
      <h2 id="importar">Importar CSV (0A.3)</h2>
      <p>
        UTF-8, con encabezados, delimitador coma o punto y coma
        (autodetectado), campos entrecomillados. Límite orientativo: 20 MB.
        Aún no soportado: otras codificaciones, sin encabezados, otros
        delimitadores, XLSX (0A.4). El archivo original no se modifica; la
        tabla en memoria se reemplaza al importar otro archivo.
      </p>
      <p>
        <label htmlFor="csv-file">Elegir archivo CSV: </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />{" "}
        <button
          type="button"
          disabled={busy || !file}
          onClick={() => file && void doImport(file)}
        >
          Importar archivo
        </button>
      </p>

      {st.phase === "empty" ? (
        <p role="status">Sin dataset: elija un CSV e impórtelo.</p>
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
            {st.summary.columns.length} columnas.
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
