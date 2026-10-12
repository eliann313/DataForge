// Generador determinista de CSV para benchmarks 0A.5 (protocolo ADR-0002).
// Semilla fija → mismos bytes en cualquier máquina. Sin dependencias.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "benchmarks", "data");
mkdirSync(outDir, { recursive: true });

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATS = ["alimentos", "transporte", "salud", "vivienda", "ocio"];

/** Fila determinista: mezcla de enteros, decimales, texto, fechas. */
function row(rand, nCols, i) {
  const cells = [];
  for (let c = 0; c < nCols; c++) {
    const kind = c % 5;
    if (kind === 0) cells.push(String(i + 1));
    else if (kind === 1) cells.push((Math.floor(rand() * 100000) / 100).toFixed(2));
    else if (kind === 2) cells.push(CATS[Math.floor(rand() * CATS.length)]);
    else if (kind === 3) {
      const day = 1 + Math.floor(rand() * 28);
      const month = 1 + Math.floor(rand() * 12);
      cells.push(`2024-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    } else cells.push(`nota-${Math.floor(rand() * 100000)}`);
  }
  return cells.join(",");
}

function header(nCols) {
  const names = [];
  for (let c = 0; c < nCols; c++) {
    const kind = c % 5;
    names.push(kind === 0 ? "id" : kind === 1 ? `importe_${c}` : kind === 2 ? `cat_${c}` : kind === 3 ? `fecha_${c}` : `txt_${c}`);
  }
  return names.join(",");
}

const SCENARIOS = [
  { name: "csv-1k-10", rows: 1000, cols: 10 },
  { name: "csv-10k-20", rows: 10000, cols: 20 },
  // 100k filas en variante angosta (bajo el límite) para temporizar ingesta;
  // la variante 100k×30 densa evidencia el corte del límite orientativo.
  { name: "csv-100k-20", rows: 100000, cols: 20 },
  { name: "csv-100k-30", rows: 100000, cols: 30 },
];

for (const s of SCENARIOS) {
  const rand = mulberry32(0xa5f19);
  const lines = [header(s.cols)];
  for (let i = 0; i < s.rows; i++) lines.push(row(rand, s.cols, i));
  const file = join(outDir, `${s.name}.csv`);
  writeFileSync(file, lines.join("\n") + "\n");
  const bytes = Buffer.byteLength(lines.join("\n"));
  console.log(`${s.name}.csv: ${s.rows} filas x ${s.cols} cols, ${bytes} bytes`);
}
