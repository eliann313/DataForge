"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ProjectsService } from "../application/service";
import { ProjectError } from "../domain/errors";
import type { Folder } from "../domain/folder";
import type { Project } from "../domain/project";
import { IndexedDBFolderRepository, IndexedDBProjectRepository } from "../infrastructure/indexeddb";

const ACTIVE_KEY = "df-active-project";

interface ProjectsState {
  projects: Project[];
  folders: Folder[];
  activeId: string | null;
  active: Project | null;
  loaded: boolean;
  error: string | null;
  search: string;
  setSearch: (q: string) => void;
  refresh: () => Promise<void>;
  select: (id: string | null) => void;
  createProject: (name: string, folderId: string | null) => Promise<Project>;
  renameProject: (id: string, name: string) => Promise<void>;
  moveProject: (id: string, folderId: string | null) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  createFolder: (name: string, parentId: string | null) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  dismissError: () => void;
}

const Context = createContext<ProjectsState | null>(null);

function messageOf(cause: unknown): string {
  if (cause instanceof ProjectError) return cause.message;
  if (cause instanceof Error && cause.message) return cause.message;
  return "Error desconocido de almacenamiento.";
}

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const service = useMemo(
    () =>
      new ProjectsService({
        projects: new IndexedDBProjectRepository(),
        folders: new IndexedDBFolderRepository(),
      }),
    [],
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  // Proyecto activo: inicializador diferido (seguro en prerender estático).
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([
        service.listProjects(),
        service.listFolders(),
      ]);
      setProjects(p);
      setFolders(f);
      setError(null);
    } catch (cause) {
      // Fallo visible, sin pérdida silenciosa: se conserva lo anterior.
      setError(messageOf(cause));
    } finally {
      setLoaded(true);
    }
  }, [service]);

  useEffect(() => {
    // Carga inicial: los setState ocurren en continuaciones asíncronas
    // (patrón de fetch permitido), con cancelación al desmontar.
    let cancelled = false;
    (async () => {
      try {
        const [p, f] = await Promise.all([
          service.listProjects(),
          service.listFolders(),
        ]);
        if (!cancelled) {
          setProjects(p);
          setFolders(f);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(messageOf(cause));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [service]);

  const select = useCallback((id: string | null) => {
    setActiveId(id);
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // Preferencia no persistida; no bloquea.
    }
  }, []);

  const mutate = useCallback(
    async (op: () => Promise<unknown>) => {
      try {
        await op();
        await refresh();
        setError(null);
      } catch (cause) {
        setError(messageOf(cause));
        throw cause;
      }
    },
    [refresh],
  );

  const value: ProjectsState = {
    projects,
    folders,
    activeId,
    active: projects.find((p) => p.id === activeId) ?? null,
    loaded,
    error,
    search,
    setSearch,
    refresh,
    select,
    createProject: async (name, folderId) => {
      let created!: Project;
      await mutate(async () => {
        created = await service.createProject({ name, folderId });
        select(created.id);
      });
      return created;
    },
    renameProject: (id, name) => mutate(() => service.renameProject(id, name)).then(() => {}),
    moveProject: (id, folderId) =>
      mutate(() => service.moveProject(id, folderId)).then(() => {}),
    deleteProject: async (id) => {
      await mutate(() => service.deleteProject(id));
      if (activeId === id) select(null);
    },
    createFolder: async (name, parentId) => {
      let created!: Folder;
      await mutate(async () => {
        created = await service.createFolder({ name, parentId });
      });
      return created;
    },
    renameFolder: (id, name) => mutate(() => service.renameFolder(id, name)).then(() => {}),
    moveFolder: (id, parentId) =>
      mutate(() => service.moveFolder(id, parentId)).then(() => {}),
    deleteFolder: (id) => mutate(() => service.deleteFolder(id)).then(() => {}),
    dismissError: () => setError(null),
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProjects(): ProjectsState {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useProjects fuera de ProjectsProvider");
  return ctx;
}
