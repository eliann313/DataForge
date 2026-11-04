"use client";

import { useState } from "react";
import { IndexedDBPipelineDefinitionRepository } from "@/modules/pipelines";
import { IndexedDBProjectRepository } from "../infrastructure/indexeddb";
import { parseProjectBackup, ProjectBackupService, serializeProjectBackup } from "@/modules/portable";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
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
  const backupService = () => new ProjectBackupService({
    projects: new IndexedDBProjectRepository(),
    definitions: new IndexedDBPipelineDefinitionRepository(),
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
    <div className="space-y-6">
      {ctx.error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm">
          {ctx.error}{" "}
          <button type="button" onClick={ctx.dismissError} className="underline">
            Descartar
          </button>
        </p>
      ) : null}
      {backupError ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm">{backupError}</p> : null}
      <p className="text-sm text-gray-600">Los respaldos portables v1 incluyen metadatos y definiciones de pipelines; no incluyen archivos importados, resultados ni snapshots. Esos datos requieren reimportar las fuentes.</p>
      <label className="inline-flex cursor-pointer rounded border px-3 py-1 text-sm">
        Importar respaldo de proyecto
        <input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { void importBackup(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      </label>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <label htmlFor="buscar" className="text-sm font-medium">
          Buscar:
        </label>
        <input
          id="buscar"
          type="search"
          value={ctx.search}
          onChange={(e) => ctx.setSearch(e.target.value)}
          placeholder="proyectos y carpetas"
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </form>

      <section aria-labelledby="carpetas">
        <h3 id="carpetas" className="mb-1 font-semibold">
          Carpetas ({folders.length})
        </h3>
        <form
          className="mb-2 flex gap-2"
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
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button type="submit" className="rounded bg-violet-800 px-3 py-1 text-sm font-medium text-white">
            Crear carpeta
          </button>
        </form>
        <ul className="space-y-1">
          {folders.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span aria-hidden>📁</span>
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
                    className="rounded border border-gray-300 px-1 py-0.5 text-sm"
                  />
                  <button type="submit" className="underline">Guardar</button>
                </form>
              ) : (
                <>
                  <strong>{f.name}</strong>
                  <span className="text-gray-500">en {folderName(f.parentId)}</span>
                  <button type="button" className="underline" onClick={() => setRenaming({ id: f.id, kind: "f", name: f.name })}>
                    Renombrar
                  </button>
                  <label className="text-gray-600">
                    Mover a{" "}
                    <select
                      value={f.parentId ?? ""}
                      onChange={(e) =>
                        run(ctx.moveFolder(f.id, e.target.value || null))
                      }
                      className="rounded border border-gray-300 px-1 py-0.5 text-sm"
                    >
                      <option value="">Raíz</option>
                      {ctx.folders.filter((x) => x.id !== f.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="text-red-700 underline"
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

      <section aria-labelledby="proyectos">
        <h3 id="proyectos" className="mb-1 font-semibold">
          Proyectos ({projects.length})
        </h3>
        <form
          className="mb-2 flex gap-2"
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
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button type="submit" className="rounded bg-violet-800 px-3 py-1 text-sm font-medium text-white">
            Crear proyecto
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
                    className="rounded border border-gray-300 px-1 py-0.5 text-sm"
                  />
                  <button type="submit" className="underline">Guardar</button>
                </form>
              ) : (
                <>
                  <strong>{p.name}</strong>
                  <span className="text-gray-500">en {folderName(p.folderId)}</span>
                  {ctx.activeId === p.id ? (
                    <span className="rounded bg-violet-100 px-1 text-xs text-violet-900">activo</span>
                  ) : null}
                  <button type="button" className="underline" onClick={() => setRenaming({ id: p.id, kind: "p", name: p.name })}>
                    Renombrar
                  </button>
                  <button type="button" className="underline" onClick={() => void exportBackup(p.id, p.name)}>Descargar respaldo</button>
                  <label className="text-gray-600">
                    Mover a{" "}
                    <select
                      value={p.folderId ?? ""}
                      onChange={(e) =>
                        run(ctx.moveProject(p.id, e.target.value || null))
                      }
                      className="rounded border border-gray-300 px-1 py-0.5 text-sm"
                    >
                      <option value="">Raíz</option>
                      {ctx.folders.map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="text-red-700 underline"
                    onClick={() =>
                      setConfirm({
                        title: "Eliminar proyecto",
                        message: `«${p.name}» se eliminará con sus metadatos. Los archivos importados en memoria no se ven afectados.`,
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
