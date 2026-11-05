"use client";

import { useState } from "react";
import { Folder, FolderPlus, Search, Plus, Archive, Upload } from "lucide-react";
import { IndexedDBPipelineDefinitionRepository } from "@/modules/pipelines";
import { IndexedDBAnalysisSnapshotRepository } from "@/modules/analysis";
import { IndexedDBReportRepository } from "@/modules/reports";
import { IndexedDBProjectRepository } from "../infrastructure/indexeddb";
import { DatasetArchiveService, parseProjectBackup, ProjectBackupService, serializeProjectBackup } from "@/modules/portable";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import { engine } from "@/platform/engines/duckdb/manager";
import { useProjects } from "./ProjectsContext";

// Gestión local de carpetas y proyectos (E3): crear, abrir, renombrar,
// mover, eliminar y buscar. Acciones destructivas con confirmación.
export default function ProjectsPanel() {
  const ctx = useProjects();
  const [newProject, setNewProject] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; kind: "p" | "f"; name: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; label: string; run: () => void } | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [datasetArchiveMessage, setDatasetArchiveMessage] = useState<string | null>(null);
  const [datasetArchiveError, setDatasetArchiveError] = useState(false);
  const datasetArchiveService = () => new DatasetArchiveService({ projects: new IndexedDBProjectRepository(), datasets: engine });
  const backupService = () => new ProjectBackupService({
    projects: new IndexedDBProjectRepository(),
    definitions: new IndexedDBPipelineDefinitionRepository(),
    snapshots: new IndexedDBAnalysisSnapshotRepository(),
    reports: new IndexedDBReportRepository(),
  });
  const exportBackup = async (projectId: string, name: string) => {
    try {
      setBackupError(null);
      const backup = await backupService().exportProject(projectId);
      const url = URL.createObjectURL(new Blob([serializeProjectBackup(backup)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 80) || "proyecto"}.dataforge.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "No se pudo exportar el respaldo.");
    }
  };
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      setBackupError(null);
      if (file.size > 5 * 1024 * 1024) throw new Error("El respaldo supera el límite de 5 MiB.");
      const backup = parseProjectBackup(await file.text());
      const project = await backupService().importProject(backup);
      await ctx.refresh();
      ctx.select(project.id);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "No se pudo importar el respaldo.");
    }
  };
  const exportDatasetArchive = async (projectId: string, name: string) => {
    try {
      setDatasetArchiveMessage(null);
      setDatasetArchiveError(false);
      const archive = await datasetArchiveService().exportProject(projectId, engine.getPortableSessionId());
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 80) || "proyecto"}.dfdataset`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDatasetArchiveMessage(`Se descargó el archivo de datasets de «${name}».`);
    } catch (error) {
      setDatasetArchiveError(true);
      setDatasetArchiveMessage(error instanceof Error ? error.message : "No se pudo exportar el archivo de datasets.");
    }
  };
  const askImportDatasetArchive = (file: File | undefined, projectId: string, projectName: string) => {
    if (!file) return;
    setDatasetArchiveMessage(null);
    setConfirm({
      title: `Importar datasets en «${projectName}»`,
      message: `Se agregarán las versiones del archivo «${file.name}» al proyecto seleccionado. El archivo incluye Parquet, esquema y linaje. No modifica proyectos existentes ni recupera carpetas, informes o snapshots. El tamaño máximo es 50 MiB en total y 20 MiB por versión.`,
      label: "Importar datasets",
      run: () => {
        void (async () => {
          try {
            const result = await datasetArchiveService().importIntoProject(file, projectId, true);
            await ctx.refresh();
            setDatasetArchiveError(false);
            setDatasetArchiveMessage(`Se importaron ${result.versionIdByRef.size} versiones en «${projectName}». Los datos quedan disponibles durante la sesión actual del motor.`);
          } catch (error) {
            setDatasetArchiveError(true);
            setDatasetArchiveMessage(error instanceof Error ? error.message : "No se pudo importar el archivo de datasets.");
          }
        })();
      },
    });
  };
  // Los fallos ya se publican en ctx.error (alerta visible); aquí solo se
  // evita el rechazo no manejado en consola.
  const run = (task: Promise<unknown>) => task.catch(() => undefined);

  const q = ctx.search.trim().toLowerCase();
  const projects = ctx.projects.filter((p) => p.name.toLowerCase().includes(q));
  const folders = ctx.folders.filter((f) => f.name.toLowerCase().includes(q));
  const folderName = (id: string | null) =>
    id === null ? "Raíz" : (ctx.folders.find((f) => f.id === id)?.name ?? "¿?");

  if (!ctx.loaded) return <p role="status">Cargando proyectos…</p>;

  return (
    <div className="space-y-5">
      {ctx.error || ctx.cleanupPendingProjectIds.length > 0 ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {ctx.error ?? "Quedó pendiente la limpieza local de un proyecto eliminado."}{" "}
          {ctx.cleanupPendingProjectIds.map((id) => <button key={id} type="button" onClick={() => run(ctx.retryProjectCleanup(id))} className="mr-2 font-semibold underline underline-offset-2">Reintentar limpieza de datos ({id})</button>)}
          {ctx.cleanupPendingProjectIds.length === 0 ? <button type="button" onClick={ctx.dismissError} className="underline underline-offset-2">Descartar</button> : null}
        </p>
      ) : null}
      {backupError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{backupError}</p> : null}
      {datasetArchiveMessage ? <p role={datasetArchiveError ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${datasetArchiveError ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{datasetArchiveMessage}</p> : null}
      <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">Opciones de respaldo y almacenamiento</summary>
        <div className="mt-3 space-y-3">
        <p>El respaldo portable v1 incluye metadatos, definiciones de pipelines, snapshots de resultados e informes. No incluye los bytes de datasets ni versiones DuckDB; para reanudar análisis, vuelva a importar las fuentes.</p>
        <p>El archivo opcional <code>.dfdataset</code> guarda versiones Parquet materializadas, esquema y linaje de datasets que siguen en la sesión DuckDB. No incluye carpetas, definiciones guardadas de pipelines, snapshots ni informes. Al importarlo, elija el proyecto de destino; los datos restaurados viven en el Worker hasta cerrar o recargar la página. Máximo: 20 MiB por versión y 50 MiB por archivo.</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">
        <Upload size={15} aria-hidden="true" /> Importar respaldo de proyecto
        <input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { void importBackup(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
        </label>
        </div>
      </details>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <label htmlFor="buscar" className="sr-only">Buscar proyectos y carpetas</label>
        <Search size={17} aria-hidden="true" className="-mr-9 ml-3 text-slate-400" />
        <input
          id="buscar"
          type="search"
          value={ctx.search}
          onChange={(e) => ctx.setSearch(e.target.value)}
          placeholder="Buscar proyectos y carpetas"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 sm:ml-auto sm:max-w-sm"
        />
      </form>

      <section aria-labelledby="carpetas" className="rounded-xl border border-slate-200 p-4">
        <h3 id="carpetas" className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <Folder size={17} aria-hidden="true" className="text-violet-700" />
          Carpetas ({folders.length})
        </h3>
        <form
          className="mb-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newFolder.trim()) {
              run(ctx.createFolder(newFolder, null).then(() => setNewFolder("")));
            }
          }}
        >
          <input
            aria-label="Nombre de carpeta nueva"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            placeholder="Nueva carpeta en la raíz"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 sm:max-w-xs"
          />
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
            <FolderPlus size={15} aria-hidden="true" /> Crear carpeta
          </button>
        </form>
        <ul className="space-y-1">
          {folders.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-sm">
              <Folder size={16} aria-hidden="true" className="text-violet-700" />
              {renaming?.id === f.id ? (
                <form
                  className="flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(ctx.renameFolder(f.id, renaming.name).then(() => setRenaming(null)));
                  }}
                >
                  <input
                    aria-label="Nuevo nombre de carpeta"
                    value={renaming.name}
                    onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                  <button type="submit" className="rounded px-2 py-1 font-medium text-violet-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">Guardar</button>
                </form>
              ) : (
                <>
                  <strong>{f.name}</strong>
                  <span className="text-gray-500">en {folderName(f.parentId)}</span>
                  <button type="button" className="rounded px-2 py-1 font-medium text-violet-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600" onClick={() => setRenaming({ id: f.id, kind: "f", name: f.name })}>
                    Renombrar
                  </button>
                  <label className="text-gray-600">
                    Mover a{" "}
                    <select
                      value={f.parentId ?? ""}
                      onChange={(e) =>
                        run(ctx.moveFolder(f.id, e.target.value || null))
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    >
                      <option value="">Raíz</option>
                      {ctx.folders.filter((x) => x.id !== f.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="rounded px-2 py-1 font-medium text-red-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
                    onClick={() =>
                      setConfirm({
                        title: "Eliminar carpeta",
                        message: `«${f.name}» se eliminará. Solo es posible si está vacía.`,
                        label: "Eliminar",
                        run: () => run(ctx.deleteFolder(f.id)),
                      })
                    }
                  >
                    Eliminar
                  </button>
                </>
              )}
            </li>
          ))}
          {folders.length === 0 ? <li className="text-sm text-gray-500">Sin carpetas.</li> : null}
        </ul>
      </section>

      <section aria-labelledby="proyectos" className="rounded-xl border border-slate-200 p-4">
        <h3 id="proyectos" className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <Archive size={17} aria-hidden="true" className="text-violet-700" />
          Proyectos ({projects.length})
        </h3>
        <form
          className="mb-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newProject.trim()) {
              run(ctx.createProject(newProject, null).then(() => setNewProject("")));
            }
          }}
        >
          <input
            aria-label="Nombre de proyecto nuevo"
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
            placeholder="Nuevo proyecto"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 sm:max-w-xs"
          />
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
            <Plus size={16} aria-hidden="true" /> Crear proyecto
          </button>
        </form>
        <ul className="space-y-1">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="radio"
                name="proyecto-activo"
                checked={ctx.activeId === p.id}
                onChange={() => ctx.select(p.id)}
                aria-label={`Abrir ${p.name}`}
              />
              {renaming?.id === p.id ? (
                <form
                  className="flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(ctx.renameProject(p.id, renaming.name).then(() => setRenaming(null)));
                  }}
                >
                  <input
                    aria-label="Nuevo nombre de proyecto"
                    value={renaming.name}
                    onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                  <button type="submit" className="rounded px-2 py-1 font-medium text-violet-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">Guardar</button>
                </form>
              ) : (
                <>
                  <strong>{p.name}</strong>
                  <span className="text-gray-500">en {folderName(p.folderId)}</span>
                  {ctx.activeId === p.id ? (
                    <span className="rounded bg-violet-100 px-1 text-xs text-violet-900">activo</span>
                  ) : null}
                  <button type="button" className="rounded px-2 py-1 font-medium text-violet-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600" onClick={() => setRenaming({ id: p.id, kind: "p", name: p.name })}>
                    Renombrar
                  </button>
                  <button type="button" className="rounded px-2 py-1 font-medium text-violet-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600" onClick={() => void exportBackup(p.id, p.name)}>Descargar respaldo</button>
                  <button type="button" className="rounded px-2 py-1 font-medium text-violet-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600" onClick={() => void exportDatasetArchive(p.id, p.name)}>Descargar datasets (.dfdataset)</button>
                  <label className="cursor-pointer rounded px-2 py-1 font-medium text-violet-700 underline underline-offset-2 focus-within:outline focus-within:outline-2 focus-within:outline-violet-600">
                    Importar datasets aquí
                    <input type="file" accept=".dfdataset,application/vnd.dataforge.dataset-archive" className="sr-only" onChange={(event) => { askImportDatasetArchive(event.currentTarget.files?.[0], p.id, p.name); event.currentTarget.value = ""; }} />
                  </label>
                  <label className="text-gray-600">
                    Mover a{" "}
                    <select
                      value={p.folderId ?? ""}
                      onChange={(e) =>
                        run(ctx.moveProject(p.id, e.target.value || null))
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    >
                      <option value="">Raíz</option>
                      {ctx.folders.map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="rounded px-2 py-1 font-medium text-red-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
                    onClick={() =>
                      setConfirm({
                        title: "Eliminar proyecto",
                        message: `«${p.name}» y sus artefactos guardados en este dispositivo se eliminarán. Los archivos importados en memoria no se ven afectados. Si falla la limpieza, se informará y podrá reintentarse.`,
                        label: "Eliminar",
                        run: () => run(ctx.deleteProject(p.id)),
                      })
                    }
                  >
                    Eliminar
                  </button>
                </>
              )}
            </li>
          ))}
          {projects.length === 0 ? <li className="text-sm text-gray-500">Sin proyectos: cree uno para empezar.</li> : null}
        </ul>
      </section>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.label ?? "Confirmar"}
        onConfirm={() => confirm?.run()}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
