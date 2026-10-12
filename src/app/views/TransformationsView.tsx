"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  columnsBeforeStep,
  PipelineService,
  type PipelineDefinition,
  type PipelineFilterOperator,
  type PipelinePreview,
  type PipelineStep,
  type PipelineVersion,
} from "@/modules/pipelines";
import { engine } from "@/platform/engines/duckdb/manager";

const pipelineService = new PipelineService(engine);

const FILTER_OPERATORS: { value: PipelineFilterOperator; label: string }[] = [
  { value: "contains", label: "contiene" },
  { value: "eq", label: "es igual" },
  { value: "gt", label: "mayor que" },
  { value: "gte", label: "mayor o igual" },
  { value: "lt", label: "menor que" },
  { value: "lte", label: "menor o igual" },
  { value: "isnull", label: "es nulo" },
  { value: "notnull", label: "no es nulo" },
];

function needsValue(op: PipelineFilterOperator): boolean {
  return op !== "isnull" && op !== "notnull";
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "nulo";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stepName(step: PipelineStep): string {
  switch (step.type) {
    case "filter": return "Filtrar filas";
    case "select": return "Seleccionar columnas";
    case "dropNulls": return "Quitar filas con nulos";
    case "fillNull": return "Reemplazar nulos";
    case "rename": return "Renombrar columna";
    case "deduplicate": return "Eliminar duplicados exactos";
    case "sort": return "Ordenar filas";
  }
}

export default function TransformationsView({
  onImportData,
}: {
  onImportData: () => void;
}) {
  const [versions, setVersions] = useState<PipelineVersion[]>(() => pipelineService.getVersions());
  const [baseVersionId, setBaseVersionId] = useState(
    () => pipelineService.getActiveVersionId() ?? pipelineService.getVersions()[0]?.id ?? "",
  );
  const [activeVersionId, setActiveVersionId] = useState<string | null>(
    () => pipelineService.getActiveVersionId(),
  );
  const [schemaState, setSchemaState] = useState<{
    versionId: string;
    columns: PipelineVersion["columns"];
  }>({ versionId: "", columns: [] });
  const [pipelineName, setPipelineName] = useState("Preparación");
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [preview, setPreview] = useState<PipelinePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const stepSequence = useRef(0);

  const definition = useMemo<PipelineDefinition>(
    () => ({ id: `pipeline-${baseVersionId || "session"}`, name: pipelineName, steps }),
    [baseVersionId, pipelineName, steps],
  );

  useEffect(() => {
    let cancelled = false;
    if (!baseVersionId) return () => { cancelled = true; };

    pipelineService.getColumns(baseVersionId).then(
      (columns) => {
        if (!cancelled) setSchemaState({ versionId: baseVersionId, columns });
      },
    ).catch((cause: unknown) => {
      if (!cancelled) {
        setMessage(cause instanceof Error ? cause.message : "No se pudo leer el esquema de la versión.");
      }
    });
    return () => { cancelled = true; };
  }, [baseVersionId]);

  const baseColumns = schemaState.versionId === baseVersionId ? schemaState.columns : [];

  function currentColumns(index = steps.length) {
    return columnsBeforeStep(baseColumns, definition, index);
  }

  function addStep(type: PipelineStep["type"]) {
    const existingSort = steps.findIndex((step) => step.type === "sort");
    if (type === "sort" && existingSort >= 0) {
      setMessage("El pipeline admite un solo paso de orden.");
      return;
    }
    const available = currentColumns();
    if (available.length === 0) {
      setMessage("No hay columnas disponibles para agregar este paso.");
      return;
    }
    const id = `step-${++stepSequence.current}`;
    let step: PipelineStep;
    switch (type) {
      case "filter":
        step = { id, type, filter: { column: available[0].name, op: "notnull" } };
        break;
      case "select":
        step = { id, type, columns: available.map((column) => column.name) };
        break;
      case "dropNulls":
        step = { id, type, columns: available.map((column) => column.name) };
        break;
      case "fillNull":
        step = { id, type, column: available[0].name, value: null };
        break;
      case "rename":
        step = {
          id,
          type,
          column: available[0].name,
          newName: `${available[0].name}_nuevo`.slice(0, 128),
        };
        break;
      case "deduplicate":
        step = { id, type };
        break;
      case "sort":
        step = { id, type, column: available[0].name, direction: "asc" };
        break;
    }
    setSteps((all) => {
      const sortIndex = all.findIndex((item) => item.type === "sort");
      if (sortIndex < 0 || type === "sort") return [...all, step];
      return [...all.slice(0, sortIndex), step, ...all.slice(sortIndex)];
    });
    setPreview(null);
    setMessage(null);
  }

  function updateStep(stepId: string, update: (step: PipelineStep) => PipelineStep) {
    setSteps((all) => all.map((step) => step.id === stepId ? update(step) : step));
    setPreview(null);
    setMessage(null);
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((all) => {
      const destination = index + direction;
      if (destination < 0 || destination >= all.length) return all;
      const next = [...all];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    setPreview(null);
  }

  async function createPreview() {
    setBusy(true);
    setMessage(null);
    try {
      setPreview(await pipelineService.preview(baseVersionId, definition));
    } catch (cause) {
      setPreview(null);
      setMessage(cause instanceof Error ? cause.message : "No se pudo generar la vista previa.");
    } finally {
      setBusy(false);
    }
  }

  async function executePipeline() {
    setBusy(true);
    setMessage(null);
    try {
      const created = await pipelineService.execute(baseVersionId, definition);
      setVersions(pipelineService.getVersions());
      setActiveVersionId(created.id);
      setPreview(null);
      setMessage(`Se creó «${created.name}». La fuente original sigue disponible.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo ejecutar el pipeline.");
    } finally {
      setBusy(false);
    }
  }

  async function activateVersion(version: PipelineVersion) {
    setBusy(true);
    setMessage(null);
    try {
      await pipelineService.activate(version.id);
      setActiveVersionId(version.id);
      setMessage(`Dataset activo: «${version.name}».`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo activar la versión.");
    } finally {
      setBusy(false);
    }
  }

  if (versions.length === 0) {
    return (
      <section className="max-w-3xl space-y-3" aria-labelledby="transformaciones-titulo">
        <h2 id="transformaciones-titulo" className="text-xl font-bold">Transformaciones · R2</h2>
        <p role="status">Importe un archivo en Datos para crear un pipeline local.</p>
        <button
          type="button"
          onClick={onImportData}
          className="rounded bg-violet-800 px-3 py-2 text-sm font-medium text-white"
        >
          Ir a Datos
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6" aria-labelledby="transformaciones-titulo">
      <header className="space-y-1">
        <h2 id="transformaciones-titulo" className="text-xl font-bold">Transformaciones · Fase 4</h2>
        <p className="text-sm text-gray-600">
          Cree una versión derivada con pasos repetibles. La fuente permanece intacta; las versiones viven en la sesión actual y se descartan al cerrar o recargar.
        </p>
      </header>

      <section className="space-y-3 rounded border border-gray-200 bg-white p-4" aria-labelledby="pipeline-configuracion">
        <h3 id="pipeline-configuracion" className="font-semibold">Definición del pipeline</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Versión de origen
            <select
              id="pipeline-base-version"
              value={baseVersionId}
              disabled={busy}
              onChange={(event) => {
                setBaseVersionId(event.target.value);
                setPreview(null);
                setMessage(null);
              }}
              className="rounded border border-gray-300 px-2 py-1"
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name} · {version.rowCount} filas
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Nombre
            <input
              value={pipelineName}
              maxLength={80}
              disabled={busy}
              onChange={(event) => setPipelineName(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <p className="text-sm text-gray-600">
            Activo: {versions.find((version) => version.id === activeVersionId)?.name ?? "sin versión"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Agregar un paso">
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("filter")} className="rounded border border-gray-300 px-2 py-1 text-sm">Agregar filtro</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("select")} className="rounded border border-gray-300 px-2 py-1 text-sm">Seleccionar columnas</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("dropNulls")} className="rounded border border-gray-300 px-2 py-1 text-sm">Quitar filas con nulos</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("fillNull")} className="rounded border border-gray-300 px-2 py-1 text-sm">Reemplazar nulos</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("rename")} className="rounded border border-gray-300 px-2 py-1 text-sm">Renombrar columna</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("deduplicate")} className="rounded border border-gray-300 px-2 py-1 text-sm">Eliminar duplicados</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("sort")} className="rounded border border-gray-300 px-2 py-1 text-sm">Ordenar filas</button>
        </div>

        {steps.length === 0 ? <p className="text-sm text-gray-600">Agregue pasos en el orden en que deben ejecutarse.</p> : null}
        <ol className="space-y-3">
          {steps.map((step, index) => {
            const available = currentColumns(index);
            return (
              <li key={step.id}>
                <fieldset className="space-y-2 rounded border border-gray-200 p-3">
                  <legend className="px-1 text-sm font-semibold">Paso {index + 1}: {stepName(step)}</legend>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {step.type === "filter" ? (
                      <>
                        <label>
                          Columna del filtro {index + 1}{" "}
                          <select
                            aria-label={`Columna del filtro ${index + 1}`}
                            value={step.filter.column}
                            disabled={busy || available.length === 0}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "filter" ? { ...current, filter: { ...current.filter, column: event.target.value } } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {available.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                          </select>
                        </label>
                        <label>
                          Operador del filtro {index + 1}{" "}
                          <select
                            aria-label={`Operador del filtro ${index + 1}`}
                            value={step.filter.op}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "filter" ? { ...current, filter: { ...current.filter, op: event.target.value as PipelineFilterOperator } } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {FILTER_OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                          </select>
                        </label>
                        {needsValue(step.filter.op) ? (
                          <label>
                            Valor del filtro {index + 1}{" "}
                            <input
                              aria-label={`Valor del filtro ${index + 1}`}
                              value={step.filter.value ?? ""}
                              disabled={busy}
                              onChange={(event) => updateStep(step.id, (current) => current.type === "filter" ? { ...current, filter: { ...current.filter, value: event.target.value } } : current)}
                              className="rounded border border-gray-300 px-1 py-0.5"
                            />
                          </label>
                        ) : null}
                      </>
                    ) : null}

                    {step.type === "select" ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {available.map((column) => (
                          <label key={column.name} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={step.columns.includes(column.name)}
                              disabled={busy}
                              onChange={(event) => updateStep(step.id, (current) => {
                                if (current.type !== "select") return current;
                                const selected = new Set(current.columns);
                                if (event.target.checked) selected.add(column.name);
                                else selected.delete(column.name);
                                return { ...current, columns: available.map((item) => item.name).filter((name) => selected.has(name)) };
                              })}
                            />
                            {column.name}
                          </label>
                        ))}
                      </div>
                    ) : null}

                    {step.type === "dropNulls" ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {available.map((column) => (
                          <label key={column.name} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={step.columns.includes(column.name)}
                              disabled={busy}
                              onChange={(event) => updateStep(step.id, (current) => {
                                if (current.type !== "dropNulls") return current;
                                const selected = new Set(current.columns);
                                if (event.target.checked) selected.add(column.name);
                                else selected.delete(column.name);
                                return { ...current, columns: available.map((item) => item.name).filter((name) => selected.has(name)) };
                              })}
                            />
                            {column.name}
                          </label>
                        ))}
                      </div>
                    ) : null}

                    {step.type === "fillNull" ? (
                      <>
                        <label>
                          Columna con nulos {index + 1}{" "}
                          <select
                            aria-label={`Columna con nulos ${index + 1}`}
                            value={step.column}
                            disabled={busy || available.length === 0}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "fillNull" ? { ...current, column: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {available.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                          </select>
                        </label>
                        <label>
                          Valor de reemplazo {index + 1}{" "}
                          <input
                            aria-label={`Valor de reemplazo ${index + 1}`}
                            value={step.value ?? ""}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "fillNull" ? { ...current, value: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          />
                        </label>
                      </>
                    ) : null}

                    {step.type === "rename" ? (
                      <>
                        <label>
                          Columna a renombrar {index + 1}{" "}
                          <select
                            aria-label={`Columna a renombrar ${index + 1}`}
                            value={step.column}
                            disabled={busy || available.length === 0}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "rename" ? { ...current, column: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {available.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                          </select>
                        </label>
                        <label>
                          Nombre nuevo {index + 1}{" "}
                          <input
                            aria-label={`Nombre nuevo ${index + 1}`}
                            value={step.newName}
                            maxLength={128}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "rename" ? { ...current, newName: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          />
                        </label>
                      </>
                    ) : null}

                    {step.type === "sort" ? (
                      <>
                        <label>
                          Ordenar por {index + 1}{" "}
                          <select
                            aria-label={`Columna para ordenar ${index + 1}`}
                            value={step.column}
                            disabled={busy || available.length === 0}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "sort" ? { ...current, column: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {available.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                          </select>
                        </label>
                        <label>
                          Dirección {index + 1}{" "}
                          <select
                            aria-label={`Dirección de orden ${index + 1}`}
                            value={step.direction}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "sort" ? { ...current, direction: event.target.value as "asc" | "desc" } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            <option value="asc">ascendente</option>
                            <option value="desc">descendente</option>
                          </select>
                        </label>
                      </>
                    ) : null}

                    {step.type === "deduplicate" ? <p>Conserva una fila por combinación idéntica en todas las columnas.</p> : null}
                    <button type="button" disabled={busy || index === 0} onClick={() => moveStep(index, -1)} aria-label={`Mover paso ${index + 1} arriba`} className="underline">Subir</button>
                    <button type="button" disabled={busy || index === steps.length - 1} onClick={() => moveStep(index, 1)} aria-label={`Mover paso ${index + 1} abajo`} className="underline">Bajar</button>
                    <button type="button" disabled={busy} onClick={() => { setSteps((all) => all.filter((item) => item.id !== step.id)); setPreview(null); }} className="text-red-700 underline">Quitar paso</button>
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !baseVersionId || steps.length === 0}
            onClick={() => void createPreview()}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {busy ? "Procesando…" : "Vista previa"}
          </button>
          <button
            type="button"
            disabled={busy || !baseVersionId || steps.length === 0}
            onClick={() => void executePipeline()}
            className="rounded bg-violet-800 px-3 py-2 text-sm font-medium text-white"
          >
            Ejecutar y crear versión
          </button>
        </div>
        {message ? <p role="status" className="text-sm text-gray-700">{message}</p> : null}
      </section>

      {preview ? (
        <section className="space-y-2" aria-labelledby="pipeline-vista-previa">
          <h3 id="pipeline-vista-previa" className="font-semibold">Vista previa del resultado</h3>
          <p className="text-sm text-gray-600">
            {preview.outputRowCount} de {preview.inputRowCount} filas · {preview.columns.length} columnas · se muestran hasta {preview.rows.length} filas.
          </p>
          {preview.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="df-table">
                <thead><tr>{preview.columns.map((column) => <th key={column.name} scope="col">{column.name}</th>)}</tr></thead>
                <tbody>
                  {preview.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>{preview.columns.map((column) => <td key={column.name}>{formatCell(row[column.name])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>El pipeline no devuelve filas.</p>}
        </section>
      ) : null}

      <section className="space-y-2" aria-labelledby="pipeline-versiones">
        <h3 id="pipeline-versiones" className="font-semibold">Versiones disponibles en esta sesión</h3>
        <div className="overflow-x-auto">
          <table className="df-table">
            <thead><tr><th scope="col">Versión</th><th scope="col">Filas</th><th scope="col">Columnas</th><th scope="col">Origen</th><th scope="col">Acción</th></tr></thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td>{version.name}{activeVersionId === version.id ? " (activa)" : ""}</td>
                  <td>{version.rowCount}</td>
                  <td>{version.columns.length}</td>
                  <td>{version.parentId ? versions.find((parent) => parent.id === version.parentId)?.name ?? "versión previa" : "Fuente original"}</td>
                  <td>
                    {activeVersionId === version.id ? "Activa" : (
                      <button type="button" disabled={busy} onClick={() => void activateVersion(version)} className="underline">
                        Usar versión
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
