// Genera public/demo-data/ventas.parquet (E4) con parquetjs-lite puro.
// 8 filas deterministas, tipos mixtos; referencia independiente en e2e/parquet.
import pkg from "parquetjs-lite";
const { ParquetSchema, ParquetWriter } = pkg;
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "demo-data", "ventas.parquet");

const schema = new ParquetSchema({
  id: { type: "INT32" },
  producto: { type: "UTF8" },
  cantidad: { type: "INT32", optional: true },
  importe: { type: "DOUBLE" },
});

const rows = [
  { id: 1, producto: "pan", cantidad: 2, importe: 300.0 },
  { id: 2, producto: "leche", cantidad: 3, importe: 450.5 },
  { id: 3, producto: "cuaderno", cantidad: null, importe: 1250.0 },
  { id: 4, producto: "pan", cantidad: 2, importe: 320.0 },
  { id: 5, producto: "leche", cantidad: 2, importe: 310.75 },
  { id: 6, producto: "pan", cantidad: 4, importe: 640.0 },
  { id: 7, producto: "leche", cantidad: null, importe: 480.25 },
  { id: 8, producto: "pan", cantidad: 1, importe: 150.0 },
];

const writer = await ParquetWriter.openFile(schema, target);
for (const row of rows) await writer.appendRow(row);
await writer.close();
console.log(`ventas.parquet: ${rows.length} filas (suma importe 3901.50, nulos cantidad 2)`);
