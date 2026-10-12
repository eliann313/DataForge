// Copia los assets DuckDB-Wasm (worker + wasm) desde node_modules a public/.
// Evita commitear binarios de ~36 MB y evita Workers cross-origin (CDN),
// que el navegador bloquea. Fuente reproducible: package-lock.json.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@duckdb", "duckdb-wasm", "dist");
const dest = join(root, "public", "vendor", "duckdb");

const FILES = ["duckdb-browser-eh.worker.js", "duckdb-eh.wasm"];

mkdirSync(dest, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const from = join(src, file);
  const to = join(dest, file);
  const fromStat = statSync(from);
  let fresh = false;
  if (existsSync(to)) {
    const toStat = statSync(to);
    fresh = toStat.size === fromStat.size && toStat.mtimeMs >= fromStat.mtimeMs;
  }
  if (!fresh) {
    copyFileSync(from, to);
    copied += 1;
    console.log(`vendor-duckdb: copiado ${file} (${fromStat.size} bytes)`);
  }
}
if (copied === 0) console.log("vendor-duckdb: sin cambios");
