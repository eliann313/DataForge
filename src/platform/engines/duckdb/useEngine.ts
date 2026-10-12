"use client";

import { useEffect, useState } from "react";
import { statusLabel, type EngineStatus } from "./contract";
import { engine } from "./manager";

export interface EngineSnapshot {
  status: EngineStatus;
  label: string;
  error: string | null;
  version: string | null;
}

function readSnapshot(): EngineSnapshot {
  const error = engine.getLastError();
  const ping = engine.getLastPing();
  return {
    status: engine.getStatus(),
    label: statusLabel(engine.getStatus()),
    error: error ? `${error.code}: ${error.message}` : null,
    version: ping ? ping.version : null,
  };
}

/** Estado del motor sincronizado entre paneles (inicio diferido incluido). */
export function useEngineSnapshot(): EngineSnapshot {
  const [snap, setSnap] = useState<EngineSnapshot>(readSnapshot);
  useEffect(() => engine.onChange(() => setSnap(readSnapshot())), []);
  return snap;
}
