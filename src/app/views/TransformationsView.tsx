"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  columnsBeforeStep,
  IndexedDBPipelineDefinitionRepository,
  isDatePipelineColumn,
  isNumericPipelineColumn,
  isTextPipelineColumn,
  PipelineService,
  type PipelineAggregate,
  type PipelineDefinition,
  type PipelineDateFormat,
  type PipelineArithmeticOperator,
  type PipelineFilterOperator,
  type PipelinePreview,
  type PipelineVersionComparison,
  type PeriodComparisonResult,
  type PipelineStep,
  type PipelineTargetType,
  type PipelineVersion,
} from "@/modules/pipelines";
import { useProjects } from "@/modules/projects";
import { MAX_PORTABLE_DATASET_BYTES } from "@/modules/portable";
import { engine } from "@/platform/engines/duckdb/manager";
import DatasetCombinationPanel from "@/app/components/DatasetCombinationPanel";
import {
  ArrowRight,
  Database,
  Filter,
  Info,
  Layers3,
  LockKeyhole,
  Play,
  Save,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Type,
  Upload,
  Workflow,
} from "lucide-react";

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
const PIPELINE_ARITHMETIC_OPERATORS: { value: PipelineArithmeticOperator; label: string }[] = [
  { value: "add", label: "Sumar (+)" },
  { value: "subtract", label: "Restar (−)" },
  { value: "multiply", label: "Multiplicar (×)" },
];
const PIPELINE_AGGREGATE_OPERATORS: { value: PipelineAggregate["operator"]; label: string }[] = [
  { value: "count", label: "Contar filas" },
  { value: "sum", label: "Sumar" },
  { value: "min", label: "Mínimo" },
  { value: "max", label: "Máximo" },
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
    case "calculate": return "Calcular columna";
    case "aggregate": return "Agrupar y agregar";
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

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <article className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700" aria-hidden="true">{icon}</span>
      <div><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div>
    </article>
  );
}

function PipelineProgress({ hasDataset, hasSteps, hasResult = false }: { hasDataset: boolean; hasSteps: boolean; hasResult?: boolean }) {
  const stages = [
    { number: "01", title: "Origen", detail: hasDataset ? "Dataset seleccionado" : "Importar dataset", icon: Database, done: hasDataset, current: !hasDataset },
    { number: "02", title: "Limpiar", detail: hasDataset ? "Configurar pasos" : "Esperando dataset", icon: Sparkles, done: hasSteps, current: hasDataset && !hasSteps },
    { number: "03", title: "Transformar", detail: hasSteps ? "Pipeline en edición" : "Esperando pasos", icon: SlidersHorizontal, done: false, current: hasSteps },
    { number: "04", title: "Resultado", detail: hasResult ? "Versión creada" : "Vista previa y versiones", icon: Table2, done: hasResult, current: false },
  ];

  return (
    <nav aria-label="Etapas del pipeline" className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] xl:items-center xl:p-4">
      {stages.map((stage, index) => {
        const Icon = stage.icon;
        return (
          <div key={stage.number} className="contents">
            <div className={`flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 ${stage.current ? "border-violet-600 bg-violet-50 ring-1 ring-violet-100" : stage.done ? "border-violet-200 bg-white" : "border-slate-200 bg-slate-50"}`} aria-current={stage.current ? "step" : undefined}>
              <Icon size={22} className={stage.current || stage.done ? "shrink-0 text-violet-700" : "shrink-0 text-slate-400"} aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{stage.number} {stage.title}</p><p className="truncate text-sm text-slate-500">{stage.detail}</p></div>
              {!stage.current && !stage.done && <LockKeyhole size={15} className="shrink-0 text-slate-400" aria-hidden="true" />}
            </div>
            {index < stages.length - 1 ? <ArrowRight size={18} className="mx-auto hidden text-slate-400 xl:block" aria-hidden="true" /> : null}
          </div>
        );
      })}
    </nav>
  );
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
  const [comparisonLeft, setComparisonLeft] = useState("");
  const [comparisonRight, setComparisonRight] = useState("");
  const [comparison, setComparison] = useState<{ leftId: string; rightId: string; result: PipelineVersionComparison } | null>(null);
  const [periodDate, setPeriodDate] = useState("");
  const [periodMeasure, setPeriodMeasure] = useState("");
  const [periodKey, setPeriodKey] = useState("");
  const [leftFrom, setLeftFrom] = useState("");
  const [leftTo, setLeftTo] = useState("");
  const [rightFrom, setRightFrom] = useState("");
  const [rightTo, setRightTo] = useState("");
  const [sameUnits, setSameUnits] = useState(false);
  const [periodResult, setPeriodResult] = useState<PeriodComparisonResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  useEffect(() => engine.onChange(() => {
    const currentVersions = pipelineService.getVersions();
    const currentActiveId = pipelineService.getActiveVersionId();
    setVersions(currentVersions);
    setActiveVersionId(currentActiveId);
    setBaseVersionId((current) => currentVersions.some((version) => version.id === current)
      ? current
      : currentActiveId ?? currentVersions[0]?.id ?? "");
  }), []);

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
  const comparisonLeftVersion = versions.find((version) => version.id === comparisonLeft);
  const comparisonRightVersion = versions.find((version) => version.id === comparisonRight);
  const commonColumns = (comparisonLeftVersion?.columns ?? []).filter((column) => comparisonRightVersion?.columns.some((right) => right.name === column.name && right.type === column.type));
  const dateColumns = commonColumns.filter((column) => column.type.toUpperCase() === "DATE");
  const leftRoles = comparisonLeftVersion ? engine.getVersionSemanticRoles(comparisonLeftVersion.id) : {};
  const rightRoles = comparisonRightVersion ? engine.getVersionSemanticRoles(comparisonRightVersion.id) : {};
  const measureColumns = commonColumns.filter((column) => isNumericPipelineColumn(column) && !/^(?:FLOAT|DOUBLE|REAL)/i.test(column.type) && leftRoles[column.name] === "medida" && rightRoles[column.name] === "medida");
  const sameComparisonSchema = Boolean(comparisonLeftVersion && comparisonRightVersion && comparisonLeftVersion.columns.length === comparisonRightVersion.columns.length && comparisonLeftVersion.columns.every((column, index) => column.name === comparisonRightVersion.columns[index].name && column.type === comparisonRightVersion.columns[index].type));

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
    const id = createPipelineId().replace(/^pipeline-/, "step-");
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
      case "calculate": {
        const numeric = available.filter(isNumericPipelineColumn);
        if (numeric.length < 2) {
          setMessage("El cálculo necesita dos columnas numéricas disponibles.");
          return;
        }
        const baseName = `${numeric[0].name}_calculado`.slice(0, 128);
        let outputName = baseName;
        let suffix = 2;
        while (available.some((column) => column.name.toLocaleLowerCase("en-US") === outputName.toLocaleLowerCase("en-US"))) {
          const ending = `_${suffix++}`;
          outputName = `${baseName.slice(0, 128 - ending.length)}${ending}`;
        }
        step = {
          id,
          type,
          leftColumn: numeric[0].name,
          operator: "add",
          rightColumn: numeric[1].name,
          outputName,
        };
        break;
      }
      case "aggregate":
        step = { id, type, groupBy: [], aggregations: [{ operator: "count", outputName: "cantidad" }] };
        break;
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

  function addAggregation(stepId: string) {
    const index = steps.findIndex((step) => step.id === stepId);
    const current = steps[index];
    if (!current || current.type !== "aggregate") return;
    const available = currentColumns(index);
    const numeric = available.find(isNumericPipelineColumn);
    const taken = [
      ...available.map((column) => column.name),
      ...current.aggregations.map((aggregation) => aggregation.outputName),
    ];
    const baseName = numeric ? `${numeric.name}_suma` : "cantidad";
    let outputName = baseName.slice(0, 128);
    let suffix = 2;
    while (taken.some((name) => name.toLocaleLowerCase("en-US") === outputName.toLocaleLowerCase("en-US"))) {
      const ending = `_${suffix++}`;
      outputName = `${baseName.slice(0, 128 - ending.length)}${ending}`;
    }
    const aggregation: PipelineAggregate = numeric
      ? { operator: "sum", column: numeric.name, outputName }
      : { operator: "count", outputName };
    updateStep(stepId, (step) => step.type === "aggregate"
      ? { ...step, aggregations: [...step.aggregations, aggregation] }
      : step);
  }

  function changeAggregationOperator(
    stepId: string,
    aggregationIndex: number,
    operator: PipelineAggregate["operator"],
  ) {
    const stepIndex = steps.findIndex((step) => step.id === stepId);
    const available = currentColumns(stepIndex).filter(isNumericPipelineColumn);
    updateStep(stepId, (step) => {
      if (step.type !== "aggregate") return step;
      const current = step.aggregations[aggregationIndex];
      if (!current) return step;
      const next: PipelineAggregate = operator === "count"
        ? { operator, outputName: current.outputName }
        : {
            operator,
            column: current.operator === "count"
              ? available[0]?.name ?? ""
              : current.column,
            outputName: current.outputName,
          };
      return { ...step, aggregations: step.aggregations.map((item, index) => index === aggregationIndex ? next : item) };
    });
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
    const projectId = engine.getCurrentProjectId();
    setBusy(true);
    setMessage(null);
    try {
      const created = await pipelineService.execute(baseVersionId, definition);
      if (created.projectId !== engine.getCurrentProjectId()) return;
      setVersions(pipelineService.getVersions());
      setActiveVersionId(created.id);
      setPreview(null);
      setMessage(`Se creó «${created.name}». La fuente original sigue disponible.`);
    } catch (cause) {
      if (projectId === engine.getCurrentProjectId()) {
        setMessage(cause instanceof Error ? cause.message : "No se pudo ejecutar el pipeline.");
      }
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

  function loadVersionDefinition(version: PipelineVersion) {
    if (!version.executedDefinition || !version.parentId || !versions.some((item) => item.id === version.parentId)) return;
    setBaseVersionId(version.parentId);
    setPipelineId(createPipelineId());
    setPipelineName(version.executedDefinition.name);
    setSteps(JSON.parse(JSON.stringify(version.executedDefinition.steps)) as PipelineStep[]);
    setSelectedDefinition(null);
    setPreview(null);
    setMessage("Se cargó una copia de los pasos ejecutados y su versión de origen.");
  }

  async function compareVersions() {
    setBusy(true);
    setMessage(null);
    setComparison(null);
    try {
      const result = await pipelineService.compareVersions(comparisonLeft, comparisonRight);
      setComparison({ leftId: comparisonLeft, rightId: comparisonRight, result });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudieron comparar las versiones.");
    } finally {
      setBusy(false);
    }
  }

  async function comparePeriods() {
    setBusy(true);
    setMessage(null);
    setPeriodResult(null);
    try {
      const result = await pipelineService.comparePeriods({ leftVersionId: comparisonLeft, rightVersionId: comparisonRight, dateColumn: periodDate, leftFrom, leftTo, rightFrom, rightTo, measureColumn: periodMeasure, keyColumn: periodKey || null, sameUnitsConfirmed: sameUnits });
      setPeriodResult(result);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudieron comparar los períodos.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadVersion(version: PipelineVersion, format: "csv" | "parquet") {
    setBusy(true);
    setMessage(null);
    let objectUrl: string | null = null;
    try {
      const exported = await pipelineService.exportVersion(version.id, format);
      const arrayBuffer = new ArrayBuffer(exported.bytes.byteLength);
      new Uint8Array(arrayBuffer).set(exported.bytes);
      const blob = new Blob([arrayBuffer], { type: exported.mediaType });
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = exported.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setMessage(`Se preparó «${exported.fileName}» sin modificar la versión de origen.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo exportar la versión.");
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl!), 1_000);
      setBusy(false);
    }
  }

  async function downloadPortableParquet(version: PipelineVersion) {
    setBusy(true);
    setMessage(null);
    let objectUrl: string | null = null;
    try {
      const exported = await engine.exportPortableDatasetVersion(version.id, MAX_PORTABLE_DATASET_BYTES);
      objectUrl = URL.createObjectURL(exported.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = exported.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setMessage(`Se preparó «${exported.fileName}» por bloques. Límite: 20 MiB por versión.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo crear la copia Parquet portable.");
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl!), 1_000);
      setBusy(false);
    }
  }

  function acceptCombinationVersion(version: PipelineVersion) {
    if (version.projectId !== engine.getCurrentProjectId()) return;
    const currentVersions = pipelineService.getVersions();
    setVersions(currentVersions);
    setBaseVersionId(version.id);
    setActiveVersionId(version.id);
  }

  if (versions.length === 0) {
    return (
      <div className="space-y-6" aria-labelledby="transformaciones-titulo">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h2 id="transformaciones-titulo" className="text-3xl font-bold tracking-tight text-slate-900">Transformaciones</h2>
              <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-sm font-semibold text-violet-800">
                <Layers3 size={16} aria-hidden="true" /> Pipeline local · R2
              </span>
            </div>
            <p className="text-base text-slate-600">Prepara, limpia y organiza tus datos con pasos reproducibles.</p>
          </div>
          <div className="flex max-w-xl items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-slate-700">
            <Info size={19} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
            <p>Las transformaciones se ejecutan localmente. Tus datos no salen del navegador.</p>
          </div>
        </header>

        <PipelineProgress hasDataset={false} hasSteps={false} />

        <section className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm sm:px-10" aria-labelledby="pipeline-vacio">
          <div className="mx-auto mb-7 flex max-w-md items-center justify-center gap-3 rounded-full bg-gradient-to-r from-violet-50 via-purple-50 to-violet-50 py-5 text-violet-700">
            <span className="grid size-14 place-items-center rounded-2xl border border-violet-100 bg-white shadow-sm"><Database size={26} aria-hidden="true" /></span>
            <ArrowRight size={18} className="text-violet-400" aria-hidden="true" />
            <span className="grid size-14 place-items-center rounded-2xl border border-violet-100 bg-white shadow-sm"><Sparkles size={26} aria-hidden="true" /></span>
            <ArrowRight size={18} className="text-violet-400" aria-hidden="true" />
            <span className="grid size-14 place-items-center rounded-2xl border border-violet-100 bg-white shadow-sm"><SlidersHorizontal size={26} aria-hidden="true" /></span>
            <ArrowRight size={18} className="text-violet-400" aria-hidden="true" />
            <span className="grid size-14 place-items-center rounded-2xl border border-violet-100 bg-white shadow-sm"><Table2 size={26} aria-hidden="true" /></span>
          </div>
          <h3 id="pipeline-vacio" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Crea tu primer pipeline</h3>
          <p className="mx-auto mt-2 max-w-xl text-slate-600">Para comenzar, importa un archivo desde Datos o prueba con datos de ejemplo.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={onImportData} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
              <Upload size={17} aria-hidden="true" /> Importar archivo
            </button>
            <button type="button" onClick={onImportData} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
              Ir a Datos
            </button>
          </div>
          <p role="status" className="mt-4 text-xs text-slate-500">Al importar un archivo, aparecerán aquí las herramientas para filtrar, cambiar tipos y combinar datasets.</p>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Acciones disponibles en un pipeline">
          <FeatureCard icon={<Filter size={22} />} title="Filtrar y ordenar" description="Selecciona los registros que necesitas y define el orden de salida." />
          <FeatureCard icon={<Type size={22} />} title="Cambiar tipos" description="Convierte columnas al tipo de dato correcto: texto, número o fecha." />
          <FeatureCard icon={<span className="text-2xl font-semibold leading-none">Σ</span>} title="Agrupar y calcular" description="Resume información con agrupaciones y cálculos reproducibles." />
        </section>
      </div>
    );
  }

  return (
    <div className="transformations-view space-y-6 text-slate-800 [&_select]:rounded-lg [&_select]:border [&_select]:border-slate-300 [&_select]:bg-white [&_select]:px-2 [&_select]:py-1.5 [&_input:not([type=checkbox])]:rounded-lg [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-slate-300 [&_input:not([type=checkbox])]:px-2 [&_input:not([type=checkbox])]:py-1.5 [&_label]:text-sm [&_label]:text-slate-700 [&_section]:scroll-mt-6 [&_section]:rounded-2xl [&_section]:border [&_section]:border-slate-200 [&_section]:bg-white [&_section]:p-4 [&_section]:shadow-sm sm:[&_section]:p-5 [&_fieldset]:rounded-xl [&_fieldset]:border-slate-200 [&_button]:transition-colors [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 [&_h3]:text-slate-900" aria-labelledby="transformaciones-titulo">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 id="transformaciones-titulo" className="text-3xl font-bold tracking-tight text-slate-900">Transformaciones</h2>
            <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-sm font-semibold text-violet-800"><Layers3 size={16} aria-hidden="true" /> Pipeline local · R2</span>
          </div>
          <p className="text-base text-slate-600">Prepara, limpia y organiza tus datos con pasos reproducibles.</p>
          <p className="mt-1 text-xs text-slate-500">Las definiciones se guardan en el proyecto de este dispositivo; los datos y las versiones permanecen en esta sesión.</p>
        </div>
        <div className="flex max-w-xl items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-slate-700">
          <Info size={19} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
          <p>Las transformaciones se ejecutan localmente. Tus datos no salen del navegador.</p>
        </div>
      </header>

      <PipelineProgress hasDataset hasSteps={steps.length > 0} hasResult={versions.some((version) => version.parentIds.length > 0)} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <DatasetCombinationPanel versions={versions} onVersionCreated={acceptCombinationVersion} />
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="pipelines-guardados">
        <div className="flex items-center gap-2"><Save size={18} className="text-violet-700" aria-hidden="true" /><h3 id="pipelines-guardados" className="font-semibold text-slate-900">Definiciones guardadas</h3></div>
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

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="pipeline-configuracion">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="pipeline-configuracion" className="font-semibold">Definición del pipeline</h3><p className="mt-1 text-sm text-slate-600">Configura el orden de las operaciones y revisa el efecto antes de crear una versión.</p></div><Workflow size={21} className="text-violet-700" aria-hidden="true" /></div>
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
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("filter")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Agregar filtro</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("select")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Seleccionar columnas</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("dropNulls")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Quitar filas con nulos</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("fillNull")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Reemplazar nulos</button>
          <button type="button" disabled={busy || !baseColumns.some(isTextPipelineColumn)} onClick={() => addStep("normalizeText")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Normalizar texto</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("convertType")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Convertir tipo</button>
          <button type="button" disabled={busy || !baseColumns.some((column) => isTextPipelineColumn(column) || isDatePipelineColumn(column))} onClick={() => addStep("normalizeDate")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Normalizar fecha</button>
          <button type="button" disabled={busy || currentColumns().filter(isNumericPipelineColumn).length < 2} onClick={() => addStep("calculate")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Calcular columna</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("aggregate")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Agrupar y agregar</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("rename")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Renombrar columna</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("deduplicate")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Eliminar duplicados</button>
          <button type="button" disabled={busy || baseColumns.length === 0} onClick={() => addStep("sort")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-violet-300 hover:bg-violet-50">Ordenar filas</button>
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

                    {step.type === "calculate" ? (
                      <>
                        <label>
                          Primera columna numérica {index + 1}{" "}
                          <select
                            aria-label={`Primera columna numérica ${index + 1}`}
                            value={step.leftColumn}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "calculate" ? { ...current, leftColumn: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {available.filter(isNumericPipelineColumn).map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}
                          </select>
                        </label>
                        <label>
                          Operación {index + 1}{" "}
                          <select
                            aria-label={`Operación del cálculo ${index + 1}`}
                            value={step.operator}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "calculate" ? { ...current, operator: event.target.value as PipelineArithmeticOperator } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {PIPELINE_ARITHMETIC_OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                          </select>
                        </label>
                        <label>
                          Segunda columna numérica {index + 1}{" "}
                          <select
                            aria-label={`Segunda columna numérica ${index + 1}`}
                            value={step.rightColumn}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "calculate" ? { ...current, rightColumn: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          >
                            {available.filter(isNumericPipelineColumn).map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}
                          </select>
                        </label>
                        <label>
                          Nombre del resultado {index + 1}{" "}
                          <input
                            aria-label={`Nombre del resultado ${index + 1}`}
                            value={step.outputName}
                            maxLength={128}
                            disabled={busy}
                            onChange={(event) => updateStep(step.id, (current) => current.type === "calculate" ? { ...current, outputName: event.target.value } : current)}
                            className="rounded border border-gray-300 px-1 py-0.5"
                          />
                        </label>
                        <p className="basis-full text-sm text-gray-600">
                          Solo se permiten suma, resta y multiplicación entre columnas numéricas. DECIMAL conserva precisión; los tipos flotantes producen DOUBLE y pueden redondear.
                        </p>
                      </>
                    ) : null}

                    {step.type === "aggregate" ? (
                      <div className="basis-full space-y-3">
                        <fieldset className="space-y-1">
                          <legend className="font-medium">Agrupar por (opcional)</legend>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {available.map((column) => (
                              <label key={column.name} className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  aria-label={`Agrupar por ${column.name}`}
                                  checked={step.groupBy.includes(column.name)}
                                  disabled={busy}
                                  onChange={(event) => updateStep(step.id, (current) => {
                                    if (current.type !== "aggregate") return current;
                                    const selected = new Set(current.groupBy);
                                    if (event.target.checked) selected.add(column.name);
                                    else selected.delete(column.name);
                                    return { ...current, groupBy: available.map((item) => item.name).filter((name) => selected.has(name)) };
                                  })}
                                />
                                {column.name}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <div className="space-y-2">
                          {step.aggregations.map((aggregation, aggregationIndex) => (
                            <div key={aggregationIndex} className="flex flex-wrap items-end gap-2 rounded border border-gray-200 p-2">
                              <label>
                                Operación de agregación {aggregationIndex + 1}{" "}
                                <select
                                  aria-label={`Operación de agregación ${aggregationIndex + 1}`}
                                  value={aggregation.operator}
                                  disabled={busy}
                                  onChange={(event) => changeAggregationOperator(step.id, aggregationIndex, event.target.value as PipelineAggregate["operator"])}
                                  className="rounded border border-gray-300 px-1 py-0.5"
                                >
                                  {PIPELINE_AGGREGATE_OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                                </select>
                              </label>
                              {aggregation.operator !== "count" ? (
                                <label>
                                  Columna de agregación {aggregationIndex + 1}{" "}
                                  <select
                                    aria-label={`Columna de agregación ${aggregationIndex + 1}`}
                                    value={aggregation.column}
                                    disabled={busy || !available.some(isNumericPipelineColumn)}
                                    onChange={(event) => updateStep(step.id, (current) => current.type === "aggregate"
                                      ? { ...current, aggregations: current.aggregations.map((item, index) => index === aggregationIndex && item.operator !== "count" ? { ...item, column: event.target.value } : item) }
                                      : current)}
                                    className="rounded border border-gray-300 px-1 py-0.5"
                                  >
                                    {available.filter(isNumericPipelineColumn).map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}
                                  </select>
                                </label>
                              ) : null}
                              <label>
                                Nombre del resultado {aggregationIndex + 1}{" "}
                                <input
                                  aria-label={`Nombre de agregación ${aggregationIndex + 1}`}
                                  value={aggregation.outputName}
                                  maxLength={128}
                                  disabled={busy}
                                  onChange={(event) => updateStep(step.id, (current) => current.type === "aggregate"
                                    ? { ...current, aggregations: current.aggregations.map((item, index) => index === aggregationIndex ? { ...item, outputName: event.target.value } : item) }
                                    : current)}
                                  className="rounded border border-gray-300 px-1 py-0.5"
                                />
                              </label>
                              <button
                                type="button"
                                aria-label={`Quitar agregación ${aggregationIndex + 1}`}
                                disabled={busy || step.aggregations.length < 2}
                                onClick={() => updateStep(step.id, (current) => current.type === "aggregate"
                                  ? { ...current, aggregations: current.aggregations.filter((_, index) => index !== aggregationIndex) }
                                  : current)}
                                className="text-red-700 underline"
                              >Quitar</button>
                            </div>
                          ))}
                        </div>
                        <button type="button" disabled={busy} onClick={() => addAggregation(step.id)} className="rounded border border-gray-300 px-2 py-1 text-sm">
                          Agregar agregación
                        </button>
                        <p className="text-sm text-gray-600">
                          El conteo incluye todas las filas. Suma, mínimo y máximo solo admiten columnas numéricas; el resultado de la suma conserva tipo decimal o entero.
                        </p>
                      </div>
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
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
          >
            {busy ? "Procesando…" : "Vista previa"}
          </button>
          <button
            type="button"
            disabled={busy || !baseVersionId || steps.length === 0}
            onClick={() => void executePipeline()}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800"
          >
            <Play size={16} aria-hidden="true" /> Ejecutar y crear versión
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
          <h4 className="font-semibold">Calidad antes y después</h4>
          <p>Filas con algún nulo: {preview.inputQuality.rowsWithNull} → {preview.outputQuality.rowsWithNull}</p>
          <p>Grupos de filas completas duplicadas: {preview.inputQuality.duplicateGroups} → {preview.outputQuality.duplicateGroups}</p>
          {preview.rowDifferences ? <p>Filas completas que salen: {preview.rowDifferences.removed} · que entran: {preview.rowDifferences.added}</p> : <p>La comparación de filas completas requiere el mismo esquema antes y después.</p>}
          <p className="text-sm text-gray-600">Un grupo duplicado contiene dos o más filas idénticas. Las diferencias cuentan copias de filas completas; una fila editada puede contar como una salida y una entrada.</p>
        </section>
      ) : null}

      <section className="space-y-2" aria-labelledby="pipeline-versiones">
        <h3 id="pipeline-versiones" className="font-semibold">Versiones disponibles en esta sesión</h3>
        <div className="overflow-x-auto">
          <table className="df-table">
            <thead><tr><th scope="col">Versión</th><th scope="col">Filas</th><th scope="col">Columnas</th><th scope="col">Origen</th><th scope="col">Acción</th><th scope="col">Exportar</th></tr></thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td>{version.name}{activeVersionId === version.id ? " (activa)" : ""}</td>
                  <td>{version.rowCount}</td>
                  <td>{version.columns.length}</td>
                  <td>{version.parentIds.length > 0
                    ? version.parentIds.map((parentId) => versions.find((parent) => parent.id === parentId)?.name ?? "versión previa").join(" + ")
                    : "Fuente original"}</td>
                  <td>
                    {activeVersionId === version.id ? "Activa" : (
                      <button type="button" disabled={busy} onClick={() => void activateVersion(version)} className="underline">
                        Usar versión
                      </button>
                    )}
                    {version.executedDefinition ? <button type="button" disabled={busy || !versions.some((item) => item.id === version.parentId)} onClick={() => loadVersionDefinition(version)} className="ml-2 underline">Cargar pasos</button> : null}
                  </td>
                  <td className="space-x-2">
                    <button type="button" disabled={busy} onClick={() => void downloadVersion(version, "csv")} aria-label={`Exportar ${version.name} a CSV`} className="underline">CSV</button>
                    <button type="button" disabled={busy} onClick={() => void downloadVersion(version, "parquet")} aria-label={`Exportar ${version.name} a Parquet`} className="underline">Parquet</button>
                    <button type="button" disabled={busy} onClick={() => void downloadPortableParquet(version)} aria-label={`Copia portable de ${version.name} en Parquet`} className="underline">Copia limitada</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-600">
          CSV antepone un apóstrofo a encabezados y textos que podrían ejecutarse como fórmulas al abrirlos en una hoja de cálculo. Parquet conserva los valores. La copia portable escribe por batches y limita cada versión a 20 MiB; no contiene metadatos del proyecto. La versión en el motor no se altera.
        </p>
      </section>
      <section className="space-y-2" aria-labelledby="comparar-versiones">
        <h3 id="comparar-versiones" className="font-semibold">Comparar versiones o períodos</h3>
        <p className="text-sm text-gray-600">Elija dos versiones que representen los períodos o resultados que quiere comparar. Cada indicador se calcula sobre todas las filas y columnas de cada versión.</p>
        <label>Primera versión <select aria-label="Primera versión para comparar" disabled={busy} value={versions.some((version) => version.id === comparisonLeft) ? comparisonLeft : ""} onChange={(event) => { setComparisonLeft(event.target.value); setComparison(null); setPeriodResult(null); setPeriodDate(""); setPeriodMeasure(""); setPeriodKey(""); setSameUnits(false); }}><option value="">Seleccione una versión</option>{versions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label>{" "}
        <label>Segunda versión <select aria-label="Segunda versión para comparar" disabled={busy} value={versions.some((version) => version.id === comparisonRight) ? comparisonRight : ""} onChange={(event) => { setComparisonRight(event.target.value); setComparison(null); setPeriodResult(null); setPeriodDate(""); setPeriodMeasure(""); setPeriodKey(""); setSameUnits(false); }}><option value="">Seleccione una versión</option>{versions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label>{" "}
        <button type="button" disabled={busy || !versions.some((version) => version.id === comparisonLeft) || !versions.some((version) => version.id === comparisonRight)} onClick={() => void compareVersions()} className="underline">Comparar versiones</button>
        {comparison && versions.some((version) => version.id === comparison.leftId) && versions.some((version) => version.id === comparison.rightId) ? (
          <table className="df-table">
            <caption>Comparación de versiones</caption>
            <thead><tr><th scope="col">Indicador</th><th scope="col">{versions.find((version) => version.id === comparison.leftId)?.name}</th><th scope="col">{versions.find((version) => version.id === comparison.rightId)?.name}</th></tr></thead>
            <tbody>
              <tr><th scope="row">Filas</th><td>{comparison.result.left.rowCount}</td><td>{comparison.result.right.rowCount}</td></tr>
              <tr><th scope="row">Filas con algún nulo</th><td>{comparison.result.left.quality.rowsWithNull}</td><td>{comparison.result.right.quality.rowsWithNull}</td></tr>
              <tr><th scope="row">Grupos de filas completas duplicadas</th><td>{comparison.result.left.quality.duplicateGroups}</td><td>{comparison.result.right.quality.duplicateGroups}</td></tr>
            </tbody>
          </table>
        ) : null}
        {comparison && versions.some((version) => version.id === comparison.leftId) && versions.some((version) => version.id === comparison.rightId) ? (
          comparison.result.rowDifferences ? <p>Copias de filas excedentes en la primera: {comparison.result.rowDifferences.removed} · en la segunda: {comparison.result.rowDifferences.added}</p> : <p>La comparación de filas completas requiere versiones con el mismo esquema.</p>
        ) : null}
        <p className="text-sm text-gray-600">Un grupo duplicado contiene dos o más filas idénticas dentro de una misma versión. Las diferencias cuentan copias de filas completas; una fila editada puede aparecer en ambos lados.</p>
        {comparisonLeftVersion && comparisonRightVersion ? <div className="space-y-2">
          <h4 className="font-semibold">Comparar períodos por fecha</h4>
          <p className="text-sm text-gray-600">Los dos extremos de cada período están incluidos; las fechas nulas quedan fuera. Seleccione una columna DATE y una medida entera o decimal exacta compartidas.</p>
          <label>Columna de fecha <select aria-label="Columna de fecha para períodos" disabled={busy} value={periodDate} onChange={(event) => { setPeriodDate(event.target.value); setPeriodResult(null); }}><option value="">Seleccione</option>{dateColumns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select></label>{" "}
          <label>Medida <select aria-label="Medida para períodos" disabled={busy} value={periodMeasure} onChange={(event) => { setPeriodMeasure(event.target.value); setPeriodResult(null); setSameUnits(false); }}><option value="">Seleccione</option>{measureColumns.map((column) => <option key={column.name} value={column.name}>{column.name} ({column.type})</option>)}</select></label>
          <div className="flex flex-wrap gap-2">
            <label>Primero desde <input type="date" aria-label="Primer período desde" disabled={busy} value={leftFrom} onChange={(event) => { setLeftFrom(event.target.value); setPeriodResult(null); }} /></label>
            <label>hasta <input type="date" aria-label="Primer período hasta" disabled={busy} value={leftTo} onChange={(event) => { setLeftTo(event.target.value); setPeriodResult(null); }} /></label>
            <label>Segundo desde <input type="date" aria-label="Segundo período desde" disabled={busy} value={rightFrom} onChange={(event) => { setRightFrom(event.target.value); setPeriodResult(null); }} /></label>
            <label>hasta <input type="date" aria-label="Segundo período hasta" disabled={busy} value={rightTo} onChange={(event) => { setRightTo(event.target.value); setPeriodResult(null); }} /></label>
          </div>
          <label>Clave para identificar cambios (opcional) <select aria-label="Clave para comparar períodos" value={periodKey} disabled={busy || !sameComparisonSchema} onChange={(event) => { setPeriodKey(event.target.value); setPeriodResult(null); }}><option value="">Sin clave</option>{commonColumns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select></label>
          {!sameComparisonSchema ? <p className="text-sm text-gray-600">La comparación por clave requiere esquemas idénticos.</p> : null}
          <label className="block"><input type="checkbox" disabled={busy} checked={sameUnits} onChange={(event) => { setSameUnits(event.target.checked); setPeriodResult(null); }} /> Confirmo que todos los valores comparados usan la misma unidad y moneda.</label>
          <button type="button" disabled={busy || !periodDate || !periodMeasure || !leftFrom || !leftTo || !rightFrom || !rightTo || !sameUnits} onClick={() => void comparePeriods()} className="underline">Comparar períodos</button>
          {periodResult ? <div role="status">
            <table className="df-table"><caption>Resultados por período</caption><thead><tr><th scope="col">Indicador</th><th scope="col">Primero</th><th scope="col">Segundo</th></tr></thead><tbody>
              <tr><th scope="row">Filas</th><td>{periodResult.left.rows}</td><td>{periodResult.right.rows}</td></tr>
              <tr><th scope="row">Valores no nulos</th><td>{periodResult.left.valid}</td><td>{periodResult.right.valid}</td></tr>
              <tr><th scope="row">Suma exacta</th><td>{periodResult.left.sum ?? "Sin valores"}</td><td>{periodResult.right.sum ?? "Sin valores"}</td></tr>
              <tr><th scope="row">Media aproximada</th><td>{periodResult.left.mean ?? "Sin valores"}</td><td>{periodResult.right.mean ?? "Sin valores"}</td></tr>
            </tbody></table>
            {periodResult.keyed ? <p>Claves agregadas: {periodResult.keyed.added} · eliminadas: {periodResult.keyed.removed} · modificadas: {periodResult.keyed.changed} · sin cambios: {periodResult.keyed.unchanged}</p> : null}
          </div> : null}
          <p className="text-sm text-gray-600">La clave debe ser única y no nula en cada período. El cambio por clave compara todas las columnas salvo la clave y la fecha elegida. La media usa coma flotante; la suma conserva el valor entero o decimal del motor.</p>
        </div> : null}
      </section>
    </div>
  );
}
