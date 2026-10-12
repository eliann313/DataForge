"use client";

import { useEffect, useState } from "react";
import { engine, type ColumnInfo, type ColumnProfile } from "./manager";
import { valueHint } from "./semantics";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "nulo";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Perfilado por columna (E4): nulos, cardinalidad, rango y frecuencias.
// Detectar no es limpiar: las transformaciones pertenecen a R2.
export default function ProfileView({ columns }: { columns: ColumnInfo[] }) {
  const [selected, setSelected] = useState(columns[0]?.name ?? "");
  const [profile, setProfile] = useState<ColumnProfile | null>(null);
  const [dups, setDups] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se monta con key por dataset (el padre reinicia): el inicializador basta.
  // El efecto solo calcula duplicados en continuación asíncrona.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const n = await engine.duplicateCount();
        if (!cancelled) setDups(n);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Error de perfilado");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [columns]);

  async function show(column: string) {
    setSelected(column);
    if (!column) {
      setProfile(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setProfile(await engine.profileColumn(column));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error de perfilado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-700">
        Duplicados potenciales:{" "}
        <strong>{dups === null ? (busy ? "calculando…" : "—") : dups}</strong>{" "}
        (grupos de filas idénticas en todas las columnas; detectar no elimina).
      </p>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <p className="text-sm">
        <label htmlFor="profile-col">Columna: </label>
        <select
          id="profile-col"
          value={selected}
          disabled={busy}
          onChange={(e) => void show(e.target.value)}
          className="rounded border border-gray-300 px-1 py-0.5"
        >
          <option value="">—</option>
          {columns.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>
      </p>
      {profile ? (
        <table className="df-table">
          <tbody>
            <tr><th scope="row">Filas totales</th><td>{profile.total}</td></tr>
            <tr><th scope="row">Nulos</th><td>{profile.nulls} ({profile.nullPct} %)</td></tr>
            <tr><th scope="row">Distintos (cardinalidad)</th><td>{profile.distinct}</td></tr>
            <tr><th scope="row">Mínimo</th><td>{formatValue(profile.min)}</td></tr>
            <tr><th scope="row">Máximo</th><td>{formatValue(profile.max)}</td></tr>
          </tbody>
        </table>
      ) : null}
      {profile && profile.top.length > 0 ? (
        <>
          <h4 className="text-sm font-semibold">Frecuencias principales</h4>
          <table className="df-table">
            <thead>
              <tr><th scope="col">Valor</th><th scope="col">Apariciones</th><th scope="col">Aviso</th></tr>
            </thead>
            <tbody>
              {profile.top.map((t, i) => (
                <tr key={i}>
                  <td>{formatValue(t.value)}</td>
                  <td>{t.count}</td>
                  <td>{valueHint(t.value) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
