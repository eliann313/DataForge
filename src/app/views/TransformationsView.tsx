"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  columnsBeforeStep,
  IndexedDBPipelineDefinitionRepository,
  isDatePipelineColumn,
  isTextPipelineColumn,
  PipelineService,
  type PipelineDefinition,
  type PipelineDateFormat,
  type PipelineFilterOperator,
  type PipelinePreview,
  type PipelineStep,
  type PipelineTargetType,
  type PipelineVersion,
} from "@/modules/pipelines";
import { useProjects } from "@/modules/projects";
import { engine } from "@/platform/engines/duckdb/manager";

const pipelineService = new PipelineService(engine, new IndexedDBPipelineDefinitionRepository());

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
const PIPELINE_TARGET_TYPES: { value: PipelineTargetType; label: string }[] = [
  { value: "INTEGER", label: "Entero (32 bits)" },
  { value: "BIGINT", label: "Entero (64 bits)" },
  { value: "DECIMAL", label: "Decimal exacto" },
  { value: "BOOLEAN", label: "Booleano" },
  { value: "VARCHAR", label: "Texto" },
];
const PIPELINE_DATE_FORMATS: { value: PipelineDateFormat; label: string }[] = [
  { value: "YYYY-MM-DD", label: "Año-mes-día (2025-12-31)" },
  { value: "DD/MM/YYYY", label: "Día/mes/año (31/12/2025)" },
  { value: "MM/DD/YYYY", label: "Mes/día/año (12/31/2025)" },
  { value: "DD-MM-YYYY", label: "Día-mes-año (31-12-2025)" },
  { value: "YYYY-MM-DD HH:mm:ss", label: "Año-mes-día y hora (2025-12-31 14:30:00)" },
];

function needsValue(op: PipelineFilterOperator): boolean {
  return op !== "isnull" && op !== "notnull";
}

function formatCell(value: unknown, columnType?: string): string {
  if (value === null || value === undefined) return "nulo";
  if (columnType?.trim().toUpperCase() === "DATE" && typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stepName(step: PipelineStep): string {
  switch (step.type) {
    case "filter": return "Filtrar filas";
    case "select": return "Seleccionar columnas";
    case "dropNulls": return "Quitar filas con nulos";
    case "fillNull": return "Reemplazar nulos";
    case "convertType": return "Convertir tipo";
    case "normalizeDate": return "Normalizar fecha";
    case "normalizeText": return "Normalizar texto";
    case "rename": return "Renombrar columna";
    case "deduplicate": return "Eliminar duplicados exactos";
    case "sort": return "Ordenar filas";
  }
}

function createPipelineId(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `pipeline-${id}`;
}

export default function TransformationsView({
  onImportData,
}: {
  onImportData: () => void;
}) {
  const { active: activeProject } = useProjects();
  const activeProjectId = activeProject?.id ?? null;
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
  const [pipelineId, setPipelineId] = useState(createPipelineId);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [definitionsState, setDefinitionsState] = useState<{
    projectId: string;
    items: PipelineDefinition[];
  } | null>(null);
  const [selectedDefinition, setSelectedDefinition] = useState<{ projectId: string; id: string } | null>(null);
  const [preview, setPreview] = useState<PipelinePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const stepSequence = useRef(0);

  const definition = useMemo<PipelineDefinition>(
    () => ({ id: pipelineId, name: pipelineName, steps }),
    [pipelineId, pipelineName, steps],
  );
  const savedDefinitions = definitionsState?.projectId === activeProjectId
    ? definitionsState.items
    : [];
  const selectedDefinitionId = selectedDefinition?.projectId === activeProjectId
    ? selectedDefinition.id
    : "";
  const definitionsLoading = Boolean(activeProjectId && definitionsState?.projectId !== activeProjectId);

  useEffect(() => {
    let cancelled = false;
    if (!activeProjectId) return () => { cancelled = true; };

    pipelineService.listDefinitions(activeProjectId).then(
      (items) => {
        if (!cancelled) setDefinitionsState({ projectId: activeProjectId, items });
      },
    ).catch((cause: unknown) => {
      if (!cancelled) {
        setDefinitionsState({ projectId: activeProjectId, items: [] });
        setMessage(cause instanceof Error ? cause.message : "No se pudieron leer las definiciones guardadas.");
      }
    });
    return () => { cancelled = true; };
  }, [activeProjectId]);

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
      case "convertType":
        step = {
          id,
          type,
          column: available[0].name,
          targetType: "INTEGER",
          precision: 18,
          scale: 2,
        };
        break;
      case "normalizeDate": {
        const column = available.find((candidate) => isTextPipelineColumn(candidate) || isDatePipelineColumn(candidate));
        if (!column) {
          setMessage("No hay columnas de texto o fecha disponibles para normalizar.");
          return;
        }
        step = { id, type, column: column.name, inputFormat: "YYYY-MM-DD" };
        break;
      }
      case "normalizeText": {
        const column = available.find(isTextPipelineColumn);
        if (!column) {
          setMessage("No hay columnas de texto disponibles para normalizar.");
          return;
        }
        step = {
          id,
          type,
          column: column.name,
          trimWhitespace: true,
          letterCase: "preserve",
          emptyToNull: true,
        };
        break;
      }
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

  async function saveDefinition() {
    if (!activeProject) {
      setMessage("Abra un proyecto para guardar la definición.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const saved = await pipelineService.saveDefinition(activeProject.id, baseVersionId, definition);
      const items = await pipelineService.listDefinitions(activeProject.id);
      setDefinitionsState({ projectId: activeProject.id, items });
      setSelectedDefinition({ projectId: activeProject.id, id: saved.id });
      setMessage(`Definición «${saved.name}» guardada en «${activeProject.name}» en este dispositivo.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo guardar la definición.");
    } finally {
      setBusy(false);
    }
  }

  async function loadDefinition() {
    const saved = savedDefinitions.find((item) => item.id === selectedDefinitionId);
    if (!saved) return;
    setBusy(true);
    setMessage(null);
    try {
      await pipelineService.validateDefinition(baseVersionId, saved);
      setPipelineId(saved.id);
      setPipelineName(saved.name);
      setSteps(JSON.parse(JSON.stringify(saved.steps)) as PipelineStep[]);
      setPreview(null);
      setMessage("Definición cargada y validada contra el esquema actual.");
    } catch (cause) {
      setMessage(cause instanceof Error ? `No se pudo cargar la definición: ${cause.message}` : "No se pudo cargar la definición.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDefinition() {
    const saved = savedDefinitions.find((item) => item.id === selectedDefinitionId);
    if (!saved || !activeProject) return;
    if (!window.confirm(`¿Eliminar la definición «${saved.name}» de este proyecto?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await pipelineService.deleteDefinition(activeProject.id, saved.id);
      setDefinitionsState((current) => current?.projectId === activeProject.id
        ? { ...current, items: current.items.filter((item) => item.id !== saved.id) }
        : current);
      setSelectedDefinition(null);
      setMessage(`Definición «${saved.name}» eliminada.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo eliminar la definición.");
    } finally {
      setBusy(false);
    }
  }

  function newDefinition() {
    setPipelineId(createPipelineId());
    setPipelineName("Preparación");
    setSteps([]);
    setSelectedDefinition(null);
    setPreview(null);
    setMessage(null);
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
          Guarde definiciones en un proyecto de este dispositivo y cree versiones derivadas repetibles. Los archivos y las versiones derivadas permanecen en la sesión; no se guardan con la definición.
        </p>
      </header>

      <section className="space-y-2 rounded border border-gray-200 bg-white p-4" aria-labelledby="pipelines-guardados">
        <h3 id="pipelines-guardados" className="font-semibold">Definiciones guardadas</h3>
        <p className="text-sm text-gray-600">
          {activeProject
            ? `Proyecto activo: ${activeProject.name}. Las definiciones se almacenan localmente.`
            : "Abra un proyecto en el inspector para guardar y recuperar definiciones."}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Definición del proyecto
            <select
              aria-label="Definición guardada"
              value={selectedDefinitionId}
              disabled={!activeProject || definitionsLoading || savedDefinitions.length === 0 || busy}
              onChange={(event) => setSelectedDefinition(activeProjectId
                ? { projectId: activeProjectId, id: event.target.value }
                : null)}
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value="">{definitionsLoading ? "Cargando…" : "Seleccione una definición"}</option>
              {savedDefinitions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={!selectedDefinitionId || !baseVersionId || busy} onClick={() => void loadDefinition()} className="rounded border border-gray-300 px-3 py-2 text-sm">
            Cargar definición
          </button>
          <button type="button" disabled={!selectedDefinitionId || busy} onClick={() => void deleteDefinition()} className="rounded border border-gray-300 px-3 py-2 text-sm text-red-700">
            Eliminar definición
          </button>
          <button type="button" disabled={!activeProject || !baseVersionId || steps.length === 0 || busy} onClick={() => void saveDefinition()} className="rounded bg-violet-800 px-3 py-2 text-sm font-medium text-white">
            Guardar definición
          </button>
          <button type="button" disabled={busy} onClick={newDefinition} className="rounded border border-gray-300 px-3 py-2 text-sm">
            Nueva definición
          </button>
        </div>
      </section>

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
          <button type="button" disabled={busy || !baseColumns.some(isTextPipelineColumn)} onClick={() => addStep("normalizeText")} className="rounded border border-gray-300 px-2 py-1 text-sm">Normalizar texto</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("convertType")} className="rounded border border-gray-300 px-2 py-1 text-sm">Convertir tipo</button>
          <button type="button" disabled={busy || !baseColumns.some((column) => isTextPipelineColumn(column) || isDatePipelineColumn(column))} onClick={() => addStep("normalizeDate")} className="rounded border border-gray-300 px-2 py-1 text-sm">Normalizar fecha</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("rename")} className="rounded border border-gray-300 px-2 py-1 text-sm">Renombrar columna</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("deduplicate")} className="rounded border border-gray-300 px-2 py-1 text-sm">Eliminar duplicados</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("sort")} className="rounded border border-gray-300 px-2 py-1 text-sm">Ordenar filas</button>
        </div>

        {steps.length === 0 ? <p className="text-sm text-gray-600">Agregue pasos en el orden en que deben ejecutarse.</p> : null}
        <ol className="space-y-3">
          {steps.map((step, index) => {
            const available = currentColumns(index);
            const selectedDateColumn = step.type === "normalizeDate"
              ? available.find((column) => column.name === step.column)
              : undefined;
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

                    {step.type === "normalizeText" ? (
                      <>
                        <label>
                          Columna de texto {index + 1}{" "}
                          <select
                            aria-label={`Columna de texto ${index + 1}`}
                            value={step.column}
                            disabled={busy || !available.some(isTextPipelineColumn)}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "normalizeText" ? { ...current, column: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {available.filter(isTextPipelineColumn).map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={step.trimWhitespace}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "normalizeText" ? { ...current, trimWhitespace: event.target.checked } : current)}
                          />
                          Quitar espacios en los extremos
                        </label>
                        <label>
                          Mayúsculas y minúsculas {index + 1}{" "}
                          <select
                            aria-label={`Mayúsculas y minúsculas ${index + 1}`}
                            value={step.letterCase}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "normalizeText" ? { ...current, letterCase: event.target.value as "preserve" | "lower" | "upper" } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            <option value="preserve">Conservar</option>
                            <option value="lower">Minúsculas</option>
                            <option value="upper">Mayúsculas</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={step.emptyToNull}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "normalizeText" ? { ...current, emptyToNull: event.target.checked } : current)}
                          />
                          Convertir texto vacío en nulo
                        </label>
                      </>
                    ) : null}

                    {step.type === "convertType" ? (
                      <>
                        <label>
                          Columna a convertir {index + 1}{" "}
                          <select
                            aria-label={`Columna a convertir ${index + 1}`}
                            value={step.column}
                            disabled={busy || available.length === 0}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "convertType" ? { ...current, column: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {available.map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}
                          </select>
                        </label>
                        <label>
                          Tipo de destino {index + 1}{" "}
                          <select
                            aria-label={`Tipo de destino ${index + 1}`}
                            value={step.targetType}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "convertType" ? { ...current, targetType: event.target.value as PipelineTargetType } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {PIPELINE_TARGET_TYPES.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
                          </select>
                        </label>
                        {step.targetType === "DECIMAL" ? (
                          <>
                            <label>
                              Precisión {index + 1}{" "}
                              <input
                                aria-label={`Precisión decimal ${index + 1}`}
                                type="number"
                                min={1}
                                max={38}
                                value={step.precision}
                                disabled={busy}
                                onChange={(event) => updateStep(step.id, (current) => current.type === "convertType" ? { ...current, precision: Number(event.target.value) } : current)}
                                className="w-20 rounded border border-gray-300 px-1 py-0.5"
                              />
                            </label>
                            <label>
                              Escala {index + 1}{" "}
                              <input
                                aria-label={`Escala decimal ${index + 1}`}
                                type="number"
                                min={0}
                                max={38}
                                value={step.scale}
                                disabled={busy}
                                onChange={(event) => updateStep(step.id, (current) => current.type === "convertType" ? { ...current, scale: Number(event.target.value) } : current)}
                                className="w-20 rounded border border-gray-300 px-1 py-0.5"
                              />
                            </label>
                          </>
                        ) : null}
                        <p className="basis-full text-sm text-gray-600">
                          Los nulos se conservan. Se rechazan valores incompatibles o conversiones que pierdan precisión; en texto use enteros simples o decimales con punto, sin miles ni notación científica.
                        </p>
                      </>
                    ) : null}

                    {step.type === "normalizeDate" ? (
                      <>
                        <label>
                          Columna de fecha {index + 1}{" "}
                          <select
                            aria-label={`Columna de fecha ${index + 1}`}
                            value={step.column}
                            disabled={busy || available.length === 0}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "normalizeDate" ? { ...current, column: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {available.filter((column) => isTextPipelineColumn(column) || isDatePipelineColumn(column)).map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}
                          </select>
                        </label>
                        {selectedDateColumn && isTextPipelineColumn(selectedDateColumn) ? (
                          <label>
                            Formato de origen {index + 1}{" "}
                            <select
                              aria-label={`Formato de fecha ${index + 1}`}
                              value={step.inputFormat}
                              disabled={busy}
                              onChange={(event) => updateStep(step.id, (current) => current.type === "normalizeDate" ? { ...current, inputFormat: event.target.value as PipelineDateFormat } : current)}
                              className="rounded border border-gray-300 px-1 py-0.5"
                            >
                              {PIPELINE_DATE_FORMATS.map((format) => <option key={format.value} value={format.value}>{format.label}</option>)}
                            </select>
                          </label>
                        ) : <p>La columna ya está tipada como fecha; se reducirá a DATE.</p>}
                        <p className="basis-full text-sm text-gray-600">
                          Elija el formato real de la columna. Las fechas inválidas se rechazan; los nulos se conservan y la salida queda como DATE.
                        </p>
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
                    <tr key={rowIndex}>{preview.columns.map((column) => <td key={column.name}>{formatCell(row[column.name], column.type)}</td>)}</tr>
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
