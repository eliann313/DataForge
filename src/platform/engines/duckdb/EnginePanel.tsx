"use client";

import { useState } from "react";
import { statusLabel, type EngineStatus } from "./contract";
import { engine } from "./manager";

interface Snapshot {
  status: EngineStatus;
  error: string | null;
  version: string | null;
}

function snapshot(): Snapshot {
  const error = engine.getLastError();
  const ping = engine.getLastPing();
  return {
    status: engine.getStatus(),
    error: error ? `${error.code}: ${error.message}` : null,
    version: ping ? ping.version : null,
  };
}

export default function EnginePanel() {
  const [snap, setSnap] = useState<Snapshot>(snapshot);
  const [busy, setBusy] = useState(false);

  async function run(op: () => Promise<void>) {
    setBusy(true);
    try {
      await op();
    } finally {
      setSnap(snapshot());
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="motor">
      <h2 id="motor">Motor analítico (0A.2)</h2>
      <p role="status">Estado: {statusLabel(snap.status)}</p>
      {snap.version ? <p>Versión DuckDB: {snap.version}</p> : null}
      {snap.error ? (
        <p role="alert">
          {snap.error} — puede reintentar o reiniciar el motor y volver a
          importar.
        </p>
      ) : null}
      {snap.status === "closed" ? (
        <p>
          El Worker se terminó: los datos en memoria se liberaron. Reinicie el
          motor para continuar.
        </p>
      ) : null}
      <div>
        <button
          type="button"
          disabled={busy || snap.status === "initializing" || snap.status === "ready"}
          onClick={() => void run(() => engine.init())}
        >
          Inicializar motor
        </button>{" "}
        <button
          type="button"
          disabled={busy || snap.status !== "ready"}
          onClick={() => void run(() => engine.close())}
        >
          Cerrar
        </button>{" "}
        <button
          type="button"
          disabled={
            busy || snap.status === "initializing" || snap.status === "idle"
          }
          onClick={() => void run(() => engine.restart())}
        >
          Reiniciar
        </button>
      </div>
    </section>
  );
}
