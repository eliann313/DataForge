import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Harness 0A.5 (protocolo ADR-0002): 5 ejecuciones por escenario temporizado,
// mediana y rango; equipo, navegador, versiones y bytes reales registrados.
// Sin cifras inventadas: todo valor sale de estas mediciones.
const RUNS = 5;

interface TimedScenario {
  file: string;
  rows: number;
  cols: number;
}

const TIMED: TimedScenario[] = [
  { file: "csv-1k-10.csv", rows: 1000, cols: 10 },
  { file: "csv-10k-20.csv", rows: 10000, cols: 20 },
  { file: "csv-100k-20.csv", rows: 100000, cols: 20 },
];

const dataDir = path.resolve("benchmarks/data");

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function range(values: number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)];
}

async function heapMB(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };
    return perf.memory ? perf.memory.usedJSHeapSize / 1048576 : null;
  });
}

async function startLongtaskCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __lt: string[] }).__lt = [];
    const observer = new PerformanceObserver((list) => {
      (window as unknown as { __lt: string[] }).__lt.push(
        ...list.getEntries().map((e) => `${Math.round(e.duration)}ms@${e.name}`),
      );
    });
    observer.observe({ entryTypes: ["longtask"] });
  });
}

async function longtaskCount(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const w = window as unknown as { __lt?: string[] };
    return Array.isArray(w.__lt) ? w.__lt.length : null;
  });
}

async function initEngine(page: Page): Promise<number> {
  const t0 = Date.now();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({
    timeout: 180_000,
  });
  return Date.now() - t0;
}

test("benchmarks tabulares + evidencia de corte de límite", async ({
  browser,
}) => {
  const browserVersion = browser.version();
  const cpu = cpus()[0];
  const report: Record<string, unknown> = {
    protocolo: "ADR-0002",
    fecha: new Date().toISOString(),
    equipo: {
      platform: `${platform()} ${release()}`,
      arch: arch(),
      cpu: cpu ? `${cpu.model} x${cpus().length}` : "desconocido",
      memGB: Math.round(totalmem() / 1073741824),
    },
    software: {
      navegador: `Chromium ${browserVersion}`,
      duckdbWasm: "1.33.1-dev57.0 (sabor eh, bundle local)",
      xlsx: "0.18.5",
      next: "16.4.0",
      node: process.version,
    },
    ejecucionesPorEscenario: RUNS,
    escenarios: [] as unknown[],
  };

  for (const scenario of TIMED) {
    const filePath = path.join(dataDir, scenario.file);
    const bytes = statSync(filePath).size;
    const runs: Record<string, unknown>[] = [];
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/");
      await startLongtaskCounter(page);
      const initMs = await initEngine(page);
      const heapBefore = await heapMB(page);
      await page.locator("#csv-file").setInputFiles(filePath);
      const t0 = Date.now();
      await page.getByRole("button", { name: /importar archivo/i }).click();
      await expect(
        page.getByText(`${scenario.rows} filas, ${scenario.cols} columnas`),
      ).toBeVisible({ timeout: 300_000 });
      const wallMs = Date.now() - t0;
      const statusText =
        (await page
          .locator('section[aria-labelledby="importar"] p[role="status"]')
          .first()
          .innerText()) ?? "";
      const engineMs = Number(/importados en (\d+) ms/.exec(statusText)?.[1] ?? NaN);
      const heapAfter = await heapMB(page);
      runs.push({
        initMs,
        importWallMs: wallMs,
        importEngineMs: Number.isFinite(engineMs) ? engineMs : null,
        longtasks: await longtaskCount(page),
        heapDeltaMB:
          heapBefore !== null && heapAfter !== null
            ? Math.round((heapAfter - heapBefore) * 10) / 10
            : null,
      });
      await context.close();
    }
    const initVals = runs.map((r) => r.initMs as number);
    const wallVals = runs.map((r) => r.importWallMs as number);
    (report.escenarios as unknown[]).push({
      archivo: scenario.file,
      filas: scenario.rows,
      columnas: scenario.cols,
      bytes,
      medianaInitMs: median(initVals),
      rangoInitMs: range(initVals),
      medianaImportWallMs: median(wallVals),
      rangoImportWallMs: range(wallVals),
      corridas: runs,
    });
  }

  // Evidencia de corte: variante densa 100k×30 supera el límite orientativo.
  {
    const filePath = path.join(dataDir, "csv-100k-30.csv");
    const bytes = statSync(filePath).size;
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");
    await initEngine(page);
    await page.locator("#csv-file").setInputFiles(filePath);
    await page.getByRole("button", { name: /importar archivo/i }).click();
    const alert = page.locator('section[aria-labelledby="importar"] p[role="alert"]');
    await expect(alert).toContainText(/20 MB/, { timeout: 60_000 });
    (report.escenarios as unknown[]).push({
      archivo: "csv-100k-30.csv",
      filas: 100000,
      columnas: 30,
      bytes,
      resultado: "rechazado por límite orientativo de 20 MB (comportamiento esperado del spike)",
    });
    await context.close();
  }

  const resultsDir = path.resolve("benchmarks/results");
  mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outFile = path.join(resultsDir, `bench-${platform()}-${stamp}.json`);
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`Benchmarks registrados en ${outFile}`);
});
