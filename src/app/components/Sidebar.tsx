"use client";

// Navegación documentada (docs/design/README.md §3). Solo Inicio y Datos
// están disponibles en E3; el resto se muestra deshabilitado con aviso,
// no como funcionalidad.
export type ViewName =
  | "inicio"
  | "datos"
  | "analisis"
  | "transformaciones"
  | "laboratorio"
  | "informes";

const ITEMS: { id: ViewName; label: string; ready: boolean }[] = [
  { id: "inicio", label: "Inicio", ready: true },
  { id: "datos", label: "Datos", ready: true },
  { id: "analisis", label: "Análisis", ready: true },
  { id: "transformaciones", label: "Transformaciones", ready: false },
  { id: "laboratorio", label: "Laboratorio", ready: false },
  { id: "informes", label: "Informes", ready: false },
];

export default function Sidebar({
  view,
  onNavigate,
}: {
  view: ViewName;
  onNavigate: (v: ViewName) => void;
}) {
  return (
    <nav aria-label="Secciones" className="space-y-1">
      {ITEMS.map((item) =>
        item.ready ? (
          <button
            key={item.id}
            type="button"
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
            className={`block w-full rounded px-3 py-2 text-left text-sm ${
              view === item.id
                ? "bg-violet-800 font-semibold text-white"
                : "text-gray-200 hover:bg-gray-700"
            }`}
          >
            {item.label}
          </button>
        ) : (
          <span
            key={item.id}
            title="Disponible en fases posteriores"
            aria-disabled="true"
            className="block w-full cursor-not-allowed rounded px-3 py-2 text-left text-sm text-gray-500"
          >
            {item.label}{" "}
            <span className="text-xs">(próximamente)</span>
          </span>
        ),
      )}
    </nav>
  );
}
