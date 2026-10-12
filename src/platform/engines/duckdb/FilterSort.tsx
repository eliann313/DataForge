"use client";

import { useState } from "react";
import type { ColumnInfo, DataFilter, DataSort, FilterOp } from "./manager";

const OPS: { value: FilterOp; label: string }[] = [
  { value: "contains", label: "contiene" },
  { value: "eq", label: "es igual" },
  { value: "gt", label: "mayor que" },
  { value: "gte", label: "mayor o igual" },
  { value: "lt", label: "menor que" },
  { value: "lte", label: "menor o igual" },
  { value: "isnull", label: "es nulo" },
  { value: "notnull", label: "no es nulo" },
];

const NEEDS_VALUE: FilterOp[] = ["contains", "eq", "gt", "gte", "lt", "lte"];

// Constructor de filtros y orden (E4). Los filtros se aplican sobre el
// dataset completo en DuckDB, no sobre la página visible.
export default function FilterSort({
  columns,
  onApply,
  onClear,
  busy,
}: {
  columns: ColumnInfo[];
  onApply: (filters: DataFilter[], sort: DataSort | null) => void;
  onClear: () => void;
  busy: boolean;
}) {
  const [filters, setFilters] = useState<DataFilter[]>([]);
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function addFilter() {
    if (columns.length === 0) return;
    setFilters((f) => [...f, { column: columns[0].name, op: "contains", value: "" }]);
  }

  return (
    <div className="space-y-2">
      {filters.map((f, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1 text-sm">
          <select
            aria-label={`Columna del filtro ${i + 1}`}
            value={f.column}
            disabled={busy}
            onChange={(e) =>
              setFilters((all) =>
                all.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)),
              )
            }
            className="rounded border border-gray-300 px-1 py-0.5"
          >
            {columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select
            aria-label={`Operador del filtro ${i + 1}`}
            value={f.op}
            disabled={busy}
            onChange={(e) =>
              setFilters((all) =>
                all.map((x, j) => (j === i ? { ...x, op: e.target.value as FilterOp } : x)),
              )
            }
            className="rounded border border-gray-300 px-1 py-0.5"
          >
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {NEEDS_VALUE.includes(f.op) ? (
            <input
              aria-label={`Valor del filtro ${i + 1}`}
              value={f.value ?? ""}
              disabled={busy}
              onChange={(e) =>
                setFilters((all) =>
                  all.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                )
              }
              placeholder="valor"
              className="rounded border border-gray-300 px-1 py-0.5"
            />
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => setFilters((all) => all.filter((_, j) => j !== i))}
            className="text-red-700 underline"
          >
            Quitar
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          disabled={busy || columns.length === 0}
          onClick={addFilter}
          className="rounded border border-gray-300 px-2 py-1"
        >
          Agregar filtro
        </button>
        <label>
          Ordenar por{" "}
          <select
            value={sortCol}
            disabled={busy}
            onChange={(e) => setSortCol(e.target.value)}
            className="rounded border border-gray-300 px-1 py-0.5"
          >
            <option value="">—</option>
            {columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <select
          aria-label="Dirección del orden"
          value={sortDir}
          disabled={busy}
          onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
          className="rounded border border-gray-300 px-1 py-0.5"
        >
          <option value="asc">ascendente</option>
          <option value="desc">descendente</option>
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onApply(filters, sortCol ? { column: sortCol, dir: sortDir } : null)
          }
          className="rounded bg-violet-800 px-3 py-1 font-medium text-white"
        >
          Aplicar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setFilters([]);
            setSortCol("");
            onClear();
          }}
          className="underline"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
