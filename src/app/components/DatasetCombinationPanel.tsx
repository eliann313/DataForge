"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DatasetCombinationService,
  type AppendColumnMapping,
  type DatasetColumn,
  type DatasetCombinationPreview,
  type DatasetJoinCardinality,
  type DatasetJoinType,
  type JoinKeyMapping,
  type JoinOutputColumn,
} from "@/modules/datasets";
import type { PipelineVersion } from "@/modules/pipelines";
import { engine } from "@/platform/engines/duckdb/manager";

const service = new DatasetCombinationService(engine);
type Mode = "append" | "join";

function newId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function normalizedName(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function uniqueRightName(name: string, existing: Set<string>): string {
  let candidate = `${name}_derecha`.slice(0, 128);
  let suffix = 2;
  while (existing.has(normalizedName(candidate))) {
    const tail = `_${suffix++}`;
    candidate = `${name.slice(0, 128 - tail.length)}${tail}`;
  }
  existing.add(normalizedName(candidate));
  return candidate;
}

function defaultAppendMapping(left: DatasetColumn[], right: DatasetColumn[]): AppendColumnMapping[] {
  const outputs = new Map<string, AppendColumnMapping>();
  for (const column of left) {
    outputs.set(normalizedName(column.name), {
      outputName: column.name,
      leftColumn: column.name,
      rightColumn: null,
    });
  }
  for (const column of right) {
    const key = normalizedName(column.name);
    const mapping = outputs.get(key);
    if (mapping) mapping.rightColumn = column.name;
    else outputs.set(key, { outputName: column.name, leftColumn: null, rightColumn: column.name });
  }
  return [...outputs.values()];
}

function defaultJoinOutput(left: DatasetColumn[], right: DatasetColumn[]): JoinOutputColumn[] {
  const used = new Set<string>();
  const outputs: JoinOutputColumn[] = left.map((column) => {
    used.add(normalizedName(column.name));
    return { side: "left", column: column.name, outputName: column.name };
  });
  for (const column of right) {
    const outputName = used.has(normalizedName(column.name))
      ? uniqueRightName(column.name, used)
      : column.name;
    used.add(normalizedName(outputName));
    outputs.push({ side: "right", column: column.name, outputName });
  }
  return outputs;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "nulo";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function PreviewTable({ preview, headingId }: { preview: DatasetCombinationPreview; headingId: string }) {
  return (
    <section className="space-y-2" aria-labelledby={headingId}>
      <h4 id={headingId} className="font-semibold">Vista previa de la combinación</h4>
      <p className="text-sm text-gray-700">
        Izquierda: {preview.leftRowCount} filas · derecha: {preview.rightRowCount} · resultado: {preview.outputRowCount}.
        {preview.fanoutRowCount > 0 ? ` La cardinalidad repite ${preview.fanoutRowCount} filas de la izquierda.` : " Sin multiplicación de filas detectada."}
        {` Se muestran ${preview.rows.length} filas.`}
      </p>
      {preview.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="df-table">
            <thead><tr>{preview.columns.map((column) => <th key={column.name} scope="col">{column.name}</th>)}</tr></thead>
            <tbody>{preview.rows.map((row, index) => (
              <tr key={index}>{preview.columns.map((column) => <td key={column.name}>{displayValue(row[column.name])}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="text-sm text-gray-600">La combinación no devuelve filas.</p>}
    </section>
  );
}

export default function DatasetCombinationPanel({
  versions,
  onVersionCreated,
}: {
  versions: PipelineVersion[];
  onVersionCreated: (version: PipelineVersion) => void;
}) {
  const [mode, setMode] = useState<Mode>("append");
  const [leftVersionId, setLeftVersionId] = useState("");
  const [rightVersionId, setRightVersionId] = useState("");
  const [schemas, setSchemas] = useState<{
    leftId: string;
    rightId: string;
    left: DatasetColumn[];
    right: DatasetColumn[];
  } | null>(null);
  const [appendName, setAppendName] = useState("Anexar fuentes");
  const [appendColumns, setAppendColumns] = useState<AppendColumnMapping[]>([]);
  const [appendPreviewState, setAppendPreviewState] = useState<{
    leftId: string;
    rightId: string;
    result: DatasetCombinationPreview;
  } | null>(null);
  const [joinName, setJoinName] = useState("Relacionar fuentes");
  const [joinType, setJoinType] = useState<DatasetJoinType | "">("");
  const [cardinality, setCardinality] = useState<DatasetJoinCardinality | "">("");
  const [joinKeys, setJoinKeys] = useState<JoinKeyMapping[]>([]);
  const [joinColumns, setJoinColumns] = useState<JoinOutputColumn[]>([]);
  const [joinPreviewState, setJoinPreviewState] = useState<{
    leftId: string;
    rightId: string;
    result: DatasetCombinationPreview;
  } | null>(null);
  const [confirmFanout, setConfirmFanout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [appendId] = useState(() => newId("append"));
  const [joinId] = useState(() => newId("join"));
  const resolvedLeftId = versions.some((version) => version.id === leftVersionId)
    ? leftVersionId
    : versions[0]?.id ?? "";
  const resolvedRightId = versions.some((version) => version.id === rightVersionId) && rightVersionId !== resolvedLeftId
    ? rightVersionId
    : versions.find((version) => version.id !== resolvedLeftId)?.id ?? "";
  const appendPreview = appendPreviewState?.leftId === resolvedLeftId && appendPreviewState.rightId === resolvedRightId
    ? appendPreviewState.result
    : null;
  const joinPreview = joinPreviewState?.leftId === resolvedLeftId && joinPreviewState.rightId === resolvedRightId
    ? joinPreviewState.result
    : null;

  useEffect(() => {
    let cancelled = false;
    if (!resolvedLeftId || !resolvedRightId || resolvedLeftId === resolvedRightId) return () => { cancelled = true; };
    Promise.all([service.getColumns(resolvedLeftId), service.getColumns(resolvedRightId)]).then(([left, right]) => {
      if (cancelled) return;
      setSchemas({ leftId: resolvedLeftId, rightId: resolvedRightId, left, right });
      setAppendColumns(defaultAppendMapping(left, right));
      setJoinColumns(defaultJoinOutput(left, right));
      setJoinKeys([]);
      setAppendPreviewState(null);
      setJoinPreviewState(null);
      setConfirmFanout(false);
      setMessage(null);
    }).catch((cause: unknown) => {
      if (!cancelled) setMessage(cause instanceof Error ? cause.message : "No se pudieron leer los esquemas.");
    });
    return () => { cancelled = true; };
  }, [resolvedLeftId, resolvedRightId]);

  const pairReady = schemas?.leftId === resolvedLeftId && schemas.rightId === resolvedRightId;
  const leftColumns = pairReady ? schemas.left : [];
  const rightColumns = pairReady ? schemas.right : [];
  const appendDefinition = useMemo(() => ({
    id: appendId,
    name: appendName,
    leftVersionId: resolvedLeftId,
    rightVersionId: resolvedRightId,
    columns: appendColumns,
  }), [appendId, appendName, resolvedLeftId, resolvedRightId, appendColumns]);
  const joinDefinition = useMemo(() => ({
    id: joinId,
    name: joinName,
    leftVersionId: resolvedLeftId,
    rightVersionId: resolvedRightId,
    joinType: joinType || "inner",
    cardinality: cardinality || "many-to-one",
    confirmFanout,
    keys: joinKeys,
    columns: joinColumns,
  }), [joinId, joinName, resolvedLeftId, resolvedRightId, joinType, cardinality, confirmFanout, joinKeys, joinColumns]);

  function resetAppendPreview() {
    setAppendPreviewState(null);
    setMessage(null);
  }

  function resetJoinPreview() {
    setJoinPreviewState(null);
    setConfirmFanout(false);
    setMessage(null);
  }

  async function previewAppend() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await service.previewAppend(appendDefinition);
      setAppendPreviewState({ leftId: resolvedLeftId, rightId: resolvedRightId, result });
    } catch (cause) {
      setAppendPreviewState(null);
      setMessage(cause instanceof Error ? cause.message : "No se pudo previsualizar APPEND.");
    } finally {
      setBusy(false);
    }
  }

  async function executeAppend() {
    if (!appendPreview) return;
    setBusy(true);
    setMessage(null);
    try {
      const version = await service.executeAppend(appendDefinition);
      onVersionCreated(version);
      setMessage(`Se creó «${version.name}» como versión de sesión.`);
      setAppendPreviewState(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo crear la versión APPEND.");
    } finally {
      setBusy(false);
    }
  }

  async function previewJoin() {
    if (!joinType || !cardinality) {
      setMessage("Seleccione el tipo de JOIN y confirme su cardinalidad.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await service.previewJoin(joinDefinition);
      setJoinPreviewState({ leftId: resolvedLeftId, rightId: resolvedRightId, result });
    } catch (cause) {
      setJoinPreviewState(null);
      setMessage(cause instanceof Error ? cause.message : "No se pudo previsualizar el JOIN.");
    } finally {
      setBusy(false);
    }
  }

  async function executeJoin() {
    if (!joinPreview) return;
    setBusy(true);
    setMessage(null);
    try {
      const version = await service.executeJoin(joinDefinition);
      onVersionCreated(version);
      setMessage(`Se creó «${version.name}» como versión de sesión.`);
      setJoinPreviewState(null);
      setConfirmFanout(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo crear la versión JOIN.");
    } finally {
      setBusy(false);
    }
  }

  function updatePair(left: string, right: string) {
    setLeftVersionId(left);
    setRightVersionId(right);
  }

  return (
    <section className="space-y-4 rounded border border-gray-200 bg-white p-4" aria-labelledby="combinaciones-datasets">
      <div>
        <h3 id="combinaciones-datasets" className="font-semibold">Combinar datasets</h3>
        <p className="text-sm text-gray-600">APPEND conserva filas repetidas. JOIN valida claves y cardinalidad antes de crear una versión en esta sesión.</p>
      </div>
      {versions.length < 2 ? <p className="text-sm text-gray-600">Importe al menos dos datasets en este proyecto para combinarlos.</p> : (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Operación de combinación">
            <button type="button" aria-pressed={mode === "append"} onClick={() => setMode("append")} className={`rounded border px-3 py-2 text-sm ${mode === "append" ? "border-violet-800 bg-violet-50" : "border-gray-300"}`}>APPEND / UNION ALL</button>
            <button type="button" aria-pressed={mode === "join"} onClick={() => setMode("join")} className={`rounded border px-3 py-2 text-sm ${mode === "join" ? "border-violet-800 bg-violet-50" : "border-gray-300"}`}>JOIN</button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">Fuente izquierda
              <select aria-label="Fuente izquierda" value={resolvedLeftId} disabled={busy} onChange={(event) => updatePair(event.target.value, resolvedRightId === event.target.value ? "" : resolvedRightId)} className="rounded border border-gray-300 px-2 py-1">
                <option value="">Seleccione una versión</option>
                {versions.map((version) => <option key={version.id} value={version.id}>{version.name} · {version.rowCount} filas</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">Fuente derecha
              <select aria-label="Fuente derecha" value={resolvedRightId} disabled={busy} onChange={(event) => updatePair(resolvedLeftId === event.target.value ? "" : resolvedLeftId, event.target.value)} className="rounded border border-gray-300 px-2 py-1">
                <option value="">Seleccione una versión</option>
                {versions.map((version) => <option key={version.id} value={version.id}>{version.name} · {version.rowCount} filas</option>)}
              </select>
            </label>
          </div>

          {mode === "append" ? (
            <div className="space-y-3" aria-labelledby="append-configuracion">
              <h4 id="append-configuracion" className="font-medium">Mapeo de columnas para APPEND</h4>
              <label className="flex max-w-sm flex-col gap-1 text-sm">Nombre de la combinación
                <input aria-label="Nombre de APPEND" maxLength={80} value={appendName} disabled={busy} onChange={(event) => { setAppendName(event.target.value); resetAppendPreview(); }} className="rounded border border-gray-300 px-2 py-1" />
              </label>
              {pairReady ? (
                <div className="overflow-x-auto">
                  <table className="df-table">
                    <thead><tr><th scope="col">Columna de salida</th><th scope="col">Izquierda</th><th scope="col">Derecha</th></tr></thead>
                    <tbody>{appendColumns.map((mapping, index) => (
                      <tr key={index}>
                        <td><input aria-label={`Nombre de salida APPEND ${index + 1}`} maxLength={128} value={mapping.outputName} disabled={busy} onChange={(event) => { setAppendColumns((items) => items.map((item, i) => i === index ? { ...item, outputName: event.target.value } : item)); resetAppendPreview(); }} className="rounded border border-gray-300 px-2 py-1" /></td>
                        <td><select aria-label={`Columna izquierda APPEND ${index + 1}`} value={mapping.leftColumn ?? ""} disabled={busy} onChange={(event) => { setAppendColumns((items) => items.map((item, i) => i === index ? { ...item, leftColumn: event.target.value || null } : item)); resetAppendPreview(); }} className="rounded border border-gray-300 px-2 py-1"><option value="">Sin columna</option>{leftColumns.map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}</select></td>
                        <td><select aria-label={`Columna derecha APPEND ${index + 1}`} value={mapping.rightColumn ?? ""} disabled={busy} onChange={(event) => { setAppendColumns((items) => items.map((item, i) => i === index ? { ...item, rightColumn: event.target.value || null } : item)); resetAppendPreview(); }} className="rounded border border-gray-300 px-2 py-1"><option value="">Sin columna</option>{rightColumns.map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}</select></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-gray-600">Seleccione dos versiones para leer sus esquemas.</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !pairReady} onClick={() => void previewAppend()} className="rounded border border-gray-300 px-3 py-2 text-sm">Vista previa APPEND</button>
                <button type="button" disabled={busy || !appendPreview} onClick={() => void executeAppend()} className="rounded bg-violet-800 px-3 py-2 text-sm font-medium text-white">Crear versión APPEND</button>
              </div>
              {appendPreview ? <PreviewTable preview={appendPreview} headingId="append-vista-previa" /> : null}
            </div>
          ) : (
            <div className="space-y-3" aria-labelledby="join-configuracion">
              <h4 id="join-configuracion" className="font-medium">Claves, cardinalidad y salida del JOIN</h4>
              <label className="flex max-w-sm flex-col gap-1 text-sm">Nombre de la combinación
                <input aria-label="Nombre de JOIN" maxLength={80} value={joinName} disabled={busy} onChange={(event) => { setJoinName(event.target.value); resetJoinPreview(); }} className="rounded border border-gray-300 px-2 py-1" />
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-sm">Tipo de JOIN
                  <select aria-label="Tipo de JOIN" value={joinType} disabled={busy} onChange={(event) => { setJoinType(event.target.value as DatasetJoinType | ""); resetJoinPreview(); }} className="rounded border border-gray-300 px-2 py-1">
                    <option value="">Seleccione el tipo</option><option value="inner">INNER JOIN</option><option value="left">LEFT JOIN</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">Cardinalidad confirmada
                  <select aria-label="Cardinalidad del JOIN" value={cardinality} disabled={busy} onChange={(event) => { setCardinality(event.target.value as DatasetJoinCardinality | ""); resetJoinPreview(); }} className="rounded border border-gray-300 px-2 py-1">
                    <option value="">Seleccione la cardinalidad</option><option value="one-to-one">Uno a uno</option><option value="many-to-one">Muchos a uno</option><option value="one-to-many">Uno a muchos</option>
                  </select>
                </label>
              </div>
              <fieldset className="space-y-2 rounded border border-gray-200 p-3">
                <legend className="px-1 text-sm font-semibold">Pares de claves</legend>
                {joinKeys.map((key, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
                    <select aria-label={`Clave izquierda JOIN ${index + 1}`} value={key.leftColumn} disabled={busy} onChange={(event) => { setJoinKeys((items) => items.map((item, i) => i === index ? { ...item, leftColumn: event.target.value } : item)); resetJoinPreview(); }} className="rounded border border-gray-300 px-2 py-1">
                      {leftColumns.map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}
                    </select>
                    <span aria-hidden="true">=</span>
                    <select aria-label={`Clave derecha JOIN ${index + 1}`} value={key.rightColumn} disabled={busy} onChange={(event) => { setJoinKeys((items) => items.map((item, i) => i === index ? { ...item, rightColumn: event.target.value } : item)); resetJoinPreview(); }} className="rounded border border-gray-300 px-2 py-1">
                      {rightColumns.map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}
                    </select>
                    <button type="button" disabled={busy} onClick={() => { setJoinKeys((items) => items.filter((_, i) => i !== index)); resetJoinPreview(); }} className="text-red-700 underline">Quitar clave {index + 1}</button>
                  </div>
                ))}
                <button type="button" disabled={busy || !pairReady || joinKeys.length >= 10 || leftColumns.length === 0 || rightColumns.length === 0} onClick={() => { setJoinKeys((items) => [...items, { leftColumn: leftColumns[0].name, rightColumn: rightColumns[0].name }]); resetJoinPreview(); }} className="rounded border border-gray-300 px-2 py-1 text-sm">Agregar par de claves</button>
              </fieldset>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Columnas de salida ({joinColumns.length})</summary>
                <div className="mt-2 max-h-64 space-y-1 overflow-auto">
                  {joinColumns.map((column, index) => (
                    <label key={`${column.side}-${column.column}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-48">{column.side === "left" ? "Izquierda" : "Derecha"}: {column.column}</span>
                      <input aria-label={`Nombre de salida JOIN ${index + 1}`} maxLength={128} value={column.outputName} disabled={busy} onChange={(event) => { setJoinColumns((items) => items.map((item, i) => i === index ? { ...item, outputName: event.target.value } : item)); resetJoinPreview(); }} className="rounded border border-gray-300 px-2 py-1" />
                    </label>
                  ))}
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !pairReady} onClick={() => void previewJoin()} className="rounded border border-gray-300 px-3 py-2 text-sm">Vista previa JOIN</button>
                <button type="button" disabled={busy || !joinPreview || (joinPreview.fanoutRowCount > 0 && !confirmFanout)} onClick={() => void executeJoin()} className="rounded bg-violet-800 px-3 py-2 text-sm font-medium text-white">Crear versión JOIN</button>
              </div>
              {joinPreview?.fanoutRowCount ? (
                <label className="flex items-start gap-2 text-sm text-amber-900">
                  <input type="checkbox" checked={confirmFanout} disabled={busy} onChange={(event) => setConfirmFanout(event.target.checked)} />
                  Confirmo que revisé la vista previa y acepto que la cardinalidad uno a muchos repita filas de la izquierda.
                </label>
              ) : null}
              {joinPreview ? <PreviewTable preview={joinPreview} headingId="join-vista-previa" /> : null}
            </div>
          )}
          {message ? <p role="status" className="text-sm text-gray-700">{message}</p> : null}
        </>
      )}
    </section>
  );
}
