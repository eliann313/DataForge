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
  await page.locator("#csv-file").setInputFiles({ name: "clientes.csv", mimeType: "text/csv", buffer: Buffer.from("id,importe\n1,404.25\n2,215.50\n", "utf8") });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("clientes.csv: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });
  await page.locator("#csv-file").setInputFiles({ name: "regiones.csv", mimeType: "text/csv", buffer: Buffer.from("customer_id,region\n1,Norte\n2,Sur\n", "utf8") });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("regiones.csv: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const combinations = page.locator('section[aria-labelledby="combinaciones-datasets"]');
  await combinations.getByRole("button", { name: /^join$/i }).click();
  await combinations.getByLabel("Fuente izquierda").selectOption({ label: "clientes.csv · 2 filas" });
  await combinations.getByLabel("Fuente derecha").selectOption({ label: "regiones.csv · 2 filas" });
  await combinations.getByLabel("Tipo de JOIN").selectOption("inner");
  await combinations.getByLabel("Cardinalidad del JOIN").selectOption("one-to-one");
  await combinations.getByRole("button", { name: /agregar par de claves/i }).click();
  await combinations.getByLabel("Clave izquierda JOIN 1").selectOption("id");
  await combinations.getByLabel("Clave derecha JOIN 1").selectOption("customer_id");
  await combinations.getByRole("button", { name: /vista previa join/i }).click();
  await combinations.getByRole("button", { name: /crear versión join/i }).click();
  await expect(page.locator('section[aria-labelledby="pipeline-versiones"]').getByText(/Relacionar fuentes · JOIN \(activa\)/)).toBeVisible({ timeout: 30_000 });
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
  const historicalLineage = view(page).getByLabel("Linaje del snapshot");
  await expect(historicalLineage).toContainText('"operationType": "join"');
  await expect(historicalLineage).toContainText('"name": "clientes.csv"');
  await expect(historicalLineage).toContainText('"name": "regiones.csv"');
  await expect(historicalLineage).toContainText('"parentIds"');
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
