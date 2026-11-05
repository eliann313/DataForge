import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { DateDay, Decimal, makeData, makeVector, tableFromIPC, Table as ArrowTable, tableToIPC, TimestampNanosecond } from "apache-arrow";
import { readParquet, Table as ParquetTable, writeParquet } from "parquet-wasm/node";

function decimalWords(values: bigint[]): Int32Array {
  const words = new Int32Array(values.length * 4);
  values.forEach((value, index) => {
    let remaining = BigInt.asUintN(128, value);
    for (let word = 0; word < 4; word += 1) {
      words[index * 4 + word] = Number(BigInt.asIntN(32, remaining & BigInt("0xffffffff")));
      remaining >>= BigInt(32);
    }
  });
  return words;
}

test("export Parquet conserva decimales, fecha y timestamp nanosegundo", async ({ page }) => {
  const table = new ArrowTable({
    fecha: makeVector(makeData({ type: new DateDay(), data: new Int32Array([19_358]) })),
    instante: makeVector(makeData({ type: new TimestampNanosecond(), data: new BigInt64Array([BigInt("1577836800123456789")]) })),
    monto: makeVector(makeData({ type: new Decimal(2, 38, 128), data: decimalWords([BigInt("99999999999999999999999999999999999")]) })),
  });
  const input = writeParquet(ParquetTable.fromIPCStream(tableToIPC(table, "stream")));
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({ name: "precision.parquet", mimeType: "application/octet-stream", buffer: Buffer.from(input) });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("precision.parquet: 1 filas, 3 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Copia portable de precision.parquet en Parquet" }).click();
  const download = await downloadPromise;
  const bytes = new Uint8Array(await readFile(await download.path()));
  const decoded = tableFromIPC(readParquet(bytes).intoIPCStream());

  expect(decoded.schema.fields.map((field) => field.type.toString())).toEqual(["Date32<DAY>", "Timestamp<NANOSECOND>", "Decimal[38e+2]"]);
  expect(decoded.getChild("fecha")?.get(0)).toBe(Date.parse("2023-01-01T00:00:00.000Z"));
  expect(decoded.getChild("instante")?.data[0].values[0]).toBe(BigInt("1577836800123456789"));
  expect(Array.from(decoded.getChild("monto")!.data[0].values)).toEqual(Array.from(table.getChild("monto")!.data[0].values));
});

test("export Parquet conserva un resultado HUGEINT superior a BIGINT", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });

  const maxBigint = "9223372036854775807";
  await page.locator("#csv-file").setInputFiles({ name: "bigint.csv", mimeType: "text/csv", buffer: Buffer.from(`a,b\n${maxBigint},${maxBigint}\n`) });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("bigint.csv: 1 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /calcular columna/i }).click();
  await page.getByLabel("Primera columna numérica 1").selectOption("a");
  await page.getByLabel("Segunda columna numérica 1").selectOption("b");
  await page.getByLabel("Nombre del resultado 1").fill("huge");
  await page.getByRole("button", { name: /ejecutar y crear versión/i }).click();
  const row = page.locator('section[aria-labelledby="pipeline-versiones"]').getByRole("row").filter({ hasText: "Preparación" });
  const downloadPromise = page.waitForEvent("download");
  await row.getByRole("button", { name: /Copia portable de Preparación.*Parquet/ }).click();
  const download = await downloadPromise;
  const decoded = tableFromIPC(readParquet(new Uint8Array(await readFile(await download.path()))).intoIPCStream());

  expect(decoded.schema.fields.at(-1)?.type.toString()).toBe("Decimal[38e0]");
  expect(decoded.getChild("huge")?.get(0)?.toString()).toBe("18446744073709551614");
});
