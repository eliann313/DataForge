import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Decimal, makeData, makeVector, Table as ArrowTable, tableToIPC } from "apache-arrow";
import { Table as ParquetTable, writeParquet } from "parquet-wasm/node";

// E5: análisis y gráficos. Referencias independientes (cálculo manual sobre
// promo.csv, columna importe = [300, 450.5, 320, 310.75, 640]):
// suma 2021.25, media 404.25, mediana 320, mín 300, máx 640, rango 340,
// varianza muestral 21106.375, desvío ≈ 145.28, Q1 310.75, Q3 450.5, IQR 139.75.
// Frecuencias producto: pan 3 (60 %), leche 2 (40 %).
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({
    timeout: 120_000,
  });
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/promo.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("promo.csv: 5 filas, 4 columnas")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /^análisis$/i }).click();
});

const view = (page: Page) => page.locator("main");

test("descriptivos exactos con definiciones visibles", async ({ page }) => {
  await view(page).getByLabel(/columna numérica/i).selectOption("importe");
  await view(page).getByRole("button", { name: /^calcular$/i }).first().click();
  const v = view(page);
  await expect(v.getByRole("rowheader", { name: "Media", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(v.getByText("404.25", { exact: true })).toBeVisible();
  await expect(v.getByText("320", { exact: true })).toBeVisible();
  await expect(v.getByText("2021.25", { exact: true })).toBeVisible();
  await expect(v.getByText("21106.375", { exact: true })).toBeVisible();
  await expect(v.getByText("139.75", { exact: true })).toBeVisible();
  await expect(v.getByText(/muestrales \(n−1\)/)).toBeVisible();
});

test("guarda un snapshot por proyecto y muestra resultados históricos tras recargar sin vincular la fuente", async ({ page }) => {
  const project = `Snapshots-${Date.now()}`;
  await page.getByRole("button", { name: /^inicio$/i }).click();
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(project);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(project, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByLabel(`Abrir ${project}`).check();
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/promo.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("promo.csv: 5 filas, 4 columnas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^análisis$/i }).click();
  const v = view(page);
  await v.getByLabel(/columna numérica/i).selectOption("importe");
  await v.getByRole("button", { name: /^calcular$/i }).first().click();
  await expect(v.getByText("404.25", { exact: true })).toBeVisible({ timeout: 30_000 });
  await v.locator("#desc-col").selectOption("");
  await v.locator("#snapshot-title").fill("Resumen de ventas");
  await v.getByRole("button", { name: /guardar snapshot/i }).click();
  await expect(v.getByRole("status")).toContainText(/snapshot guardado/i);

  await page.reload();
  await page.getByRole("button", { name: /^análisis$/i }).click();
  await expect(view(page).getByRole("button", { name: "Resumen de ventas" })).toBeVisible({ timeout: 15_000 });
  await expect(view(page).getByText(/fuente no disponible en esta sesión/)).toBeVisible();
  await view(page).getByRole("button", { name: "Resumen de ventas" }).click();
  await expect(view(page).getByLabel("Resultado guardado")).toContainText("404.25");
  await expect(view(page).getByLabel("Resultado guardado")).toContainText('"column": "importe"');
  await expect(view(page).getByText(/no se vincula automáticamente/)).toBeVisible();

  const otherProject = `Snapshots-otro-${Date.now()}`;
  await page.getByRole("button", { name: /^inicio$/i }).click();
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(otherProject);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(otherProject, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByLabel(`Abrir ${otherProject}`).check();
  await page.getByRole("button", { name: /^análisis$/i }).click();
  await expect(view(page).getByLabel("Resultado guardado")).toHaveCount(0);
  await expect(view(page).getByRole("button", { name: "Resumen de ventas" })).toHaveCount(0);
});

test("frecuencias con denominadores visibles", async ({ page }) => {
  await view(page).locator("#freq-col").selectOption("producto");
  await view(page).getByRole("button", { name: /^calcular$/i }).nth(1).click();
  await expect(view(page).getByRole("cell", { name: "pan", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(view(page).getByRole("cell", { name: "60", exact: true })).toBeVisible();
});

test("barras e histograma con alternativa tabular", async ({ page }) => {
  const v = view(page);
  await v.locator("#chart-x").selectOption("producto");
  await v.getByRole("button", { name: /graficar/i }).click();
  // El título vive en el canvas: se verifica el img accesible + la tabla.
  await expect(v.getByRole("img", { name: /gráfico: barras/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(v.getByText(/alternativa tabular/)).toBeVisible();
  await expect(v.getByRole("cell", { name: "pan", exact: true }).first()).toBeVisible();

  await v.locator("#chart-kind").selectOption("hist");
  await v.locator("#hist-col").selectOption("importe");
  await v.getByRole("button", { name: /graficar/i }).click();
  await expect(v.getByRole("img", { name: /gráfico: histograma/i })).toBeVisible({
    timeout: 30_000,
  });
});

test("exige columna numérica para sumar o promediar", async ({ page }) => {
  const v = view(page);
  await v.locator("#chart-x").selectOption("producto");
  await v.locator("#chart-agg").selectOption("sum");
  await v.getByRole("button", { name: /graficar/i }).click();
  await expect(v.getByRole("alert")).toContainText("Elija la columna numérica para la agregación.");
  await expect(v.getByRole("img", { name: /gráfico: barras/i })).toHaveCount(0);
});

test("advierte cuando el gráfico no incluye todos los grupos", async ({ page }) => {
  await page.getByRole("button", { name: /^datos$/i }).click();
  const rows = Array.from({ length: 501 }, (_, index) => `grupo${String(index).padStart(3, "0")}`).join("\n");
  await page.locator("#csv-file").setInputFiles({ name: "grupos.csv", mimeType: "text/csv", buffer: Buffer.from(`grupo\n${rows}\n`) });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("grupos.csv: 501 filas, 1 columnas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^análisis$/i }).click();
  await view(page).locator("#chart-x").selectOption("grupo");
  await view(page).getByRole("button", { name: /graficar/i }).click();
  await expect(view(page).getByRole("img", { name: /primeros 500, hay más/i })).toBeVisible({ timeout: 30_000 });
});

test("mantiene importado un entero grande y evita mostrar un agregado redondeado", async ({ page }) => {
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.locator("#csv-file").setInputFiles({ name: "grande.csv", mimeType: "text/csv", buffer: Buffer.from("valor\n9007199254740993\n") });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("grande.csv: 1 filas, 1 columnas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/No se pudo calcular el resumen:.*precisión numérica segura/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "9007199254740993" })).toBeVisible();
  await page.getByRole("button", { name: /^análisis$/i }).click();
  await view(page).getByLabel(/columna numérica/i).selectOption("valor");
  await view(page).getByRole("button", { name: /^calcular$/i }).first().click();
  await expect(view(page).getByRole("alert")).toContainText("precisión numérica segura");
});

test("detecta decimales de alta precisión aunque el mínimo y máximo sean simples", async ({ page }) => {
  const values = ["1000000000000000000", "1234567890123456789", "9000000000000000000"].map(BigInt);
  const words = new Uint32Array(values.length * 4);
  values.forEach((value, index) => {
    for (let part = 0; part < 4; part += 1) words[index * 4 + part] = Number((value >> BigInt(part * 32)) & BigInt("4294967295"));
  });
  const vector = makeVector(makeData({ type: new Decimal(19, 20, 128), data: words }));
  const bytes = writeParquet(ParquetTable.fromIPCStream(tableToIPC(new ArrowTable({ valor: vector }), "stream")));
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.locator("#csv-file").setInputFiles({ name: "precision.parquet", mimeType: "application/octet-stream", buffer: Buffer.from(bytes) });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("precision.parquet: 3 filas, 1 columnas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/No se pudo calcular el resumen:.*precisión numérica segura/)).toBeVisible();
  await page.getByRole("button", { name: /^análisis$/i }).click();
  await view(page).getByLabel(/columna numérica/i).selectOption("valor");
  await view(page).getByRole("button", { name: /^calcular$/i }).first().click();
  await expect(view(page).getByRole("alert")).toContainText("precisión numérica segura");
});

test("correlación justificada y hallazgos por reglas", async ({ page }) => {
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByLabel("Rol semántico de id").selectOption("medida");
  await page.getByRole("button", { name: /^análisis$/i }).click();
  const v = view(page);
  await v.getByLabel(/columna a/i).selectOption("id");
  await v.getByLabel(/columna b/i).selectOption("importe");
  await v.getByRole("button", { name: /calcular r/i }).click();
  await expect(v.getByText(/r de Pearson/)).toBeVisible({ timeout: 30_000 });
  await expect(v.getByText(/no implica causalidad/)).toBeVisible();

  await v.getByRole("button", { name: /evaluar reglas/i }).click();
  await expect(v.getByText(/\[nulos-altos\]/)).toBeVisible({ timeout: 60_000 });
  await expect(v.getByText(/\[categoria-dominante\]/)).toBeVisible();
});

test("excluye identificadores hasta que el usuario los declare medida", async ({ page }) => {
  const v = view(page);
  await expect(v.locator("#desc-col option[value='id']")).toHaveCount(0);
  await expect(v.locator("#corr-a option[value='id']")).toHaveCount(0);
  await expect(v.locator("#desc-col")).toHaveValue("importe");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await expect(page.locator("#num-col option[value='id']")).toHaveCount(0);
  await page.getByLabel("Rol semántico de id").selectOption("medida");
  await expect(page.locator("#num-col option[value='id']")).toHaveCount(1);
  await page.getByRole("button", { name: /^análisis$/i }).click();
  await expect(v.locator("#desc-col option[value='id']")).toHaveCount(1);
  await page.getByRole("button", { name: /^datos$/i }).click();
  await expect(page.getByLabel("Rol semántico de id")).toHaveValue("medida");
  await page.getByLabel("Rol semántico de id").selectOption("identificador");
  await page.getByRole("button", { name: /^análisis$/i }).click();
  await expect(v.locator("#desc-col option[value='id']")).toHaveCount(0);
});
