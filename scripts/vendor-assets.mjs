// Copia los assets WebAssembly locales desde node_modules a public/.
// Evita depender de Workers o binarios WASM servidos desde un CDN.
// Las fuentes son reproducibles desde package-lock.json.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = [
  {
    name: "duckdb",
    source: join(root, "node_modules", "@duckdb", "duckdb-wasm", "dist"),
    destination: join(root, "public", "vendor", "duckdb"),
    files: ["duckdb-browser-eh.worker.js", "duckdb-eh.wasm"],
  },
  {
    name: "parquet",
    source: join(root, "node_modules", "parquet-wasm", "esm"),
    destination: join(root, "public", "vendor", "parquet"),
    files: ["parquet_wasm_bg.wasm"],
  },
  {
    name: "duckdb-extensions/v1.5.4/wasm_eh",
    source: join(root, "vendor", "duckdb-extensions", "v1.5.4", "wasm_eh"),
    destination: join(root, "public", "vendor", "duckdb-extensions", "v1.5.4", "wasm_eh"),
    files: ["json.duckdb_extension.wasm", "parquet.duckdb_extension.wasm"],
  },
];

let copied = 0;
for (const asset of ASSETS) {
  mkdirSync(asset.destination, { recursive: true });
  for (const file of asset.files) {
    const from = join(asset.source, file);
    const to = join(asset.destination, file);
    if (!existsSync(from)) {
      const setupHint = asset.source.startsWith(join(root, "node_modules"))
        ? "La dependencia instalada puede faltar o corresponder a otra rama; ejecuta `npm ci` y vuelve a ejecutar `npm run dev`."
        : "Comprueba que el checkout incluya los assets requeridos.";
      throw new Error(`vendor-assets: falta el archivo requerido ${from}. ${setupHint}`);
    }
    const fromStat = statSync(from);
    let fresh = false;
    if (existsSync(to)) {
      const toStat = statSync(to);
      fresh = toStat.size === fromStat.size && toStat.mtimeMs >= fromStat.mtimeMs;
    }
    if (!fresh) {
      copyFileSync(from, to);
      copied += 1;
      console.log(`vendor-assets: copiado ${asset.name}/${file} (${fromStat.size} bytes)`);
    }
  }
}
if (copied === 0) console.log("vendor-assets: sin cambios");
