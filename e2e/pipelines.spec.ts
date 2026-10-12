import path from "node:path";
import { expect, test } from "@playwright/test";

test("crea una versión derivada sin alterar la fuente y permite activarla otra vez", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/duplicadas.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("duplicadas.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /eliminar duplicados/i }).click();
  await page.getByRole("button", { name: /vista previa/i }).click();
  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/2 de 3 filas/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /ejecutar y crear versión/i }).click();
  const versions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(versions.getByText(/Preparación · versión 1 \(activa\)/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^análisis$/i }).click();
  const analysis = page.locator("main");
  await analysis.getByLabel(/columna numérica/i).selectOption("id");
  await analysis.getByRole("button", { name: /^calcular$/i }).first().click();
  await expect(analysis.getByRole("row", { name: /válidos \/ faltantes/i })).toContainText("2 / 0", { timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const source = versions.getByRole("row", { name: /duplicadas\.csv/ });
  await source.getByRole("button", { name: /usar versión/i }).click();
  await expect(versions.getByText("duplicadas.csv (activa)")).toBeVisible();

  await page.getByRole("button", { name: /^análisis$/i }).click();
  await analysis.getByLabel(/columna numérica/i).selectOption("id");
  await analysis.getByRole("button", { name: /^calcular$/i }).first().click();
  await expect(analysis.getByRole("row", { name: /válidos \/ faltantes/i })).toContainText("3 / 0", { timeout: 30_000 });

  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/numeros.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("numeros.csv: 5 filas, 3 columnas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const replacementVersions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(replacementVersions.getByRole("row")).toHaveCount(2);
  await expect(replacementVersions.getByText("numeros.csv (activa)")).toBeVisible();
  await expect(replacementVersions.getByText(/Preparación/)).toHaveCount(0);
});

test("una definición inválida no crea ni activa una versión", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/duplicadas.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("duplicadas.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /renombrar columna/i }).click();
  await page.getByLabel("Columna a renombrar 1").selectOption("id");
  await page.getByLabel("Nombre nuevo 1").fill("valor");
  await page.getByRole("button", { name: /ejecutar y crear versión/i }).click();

  await expect(page.locator("main").getByRole("status")).toContainText(/Ya existe una columna/);
  const versions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(versions.getByRole("row")).toHaveCount(2);
  await expect(versions.getByText("duplicadas.csv (activa)")).toBeVisible();
});

test("un filtro de texto conserva códigos numéricos con ceros a la izquierda", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "codigos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("codigo\n00123\nX\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("codigos.csv: 2 filas, 1 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /agregar filtro/i }).click();
  await page.getByLabel("Operador del filtro 1").selectOption("eq");
  await page.getByLabel("Valor del filtro 1").fill("00123");
  await page.getByRole("button", { name: /vista previa/i }).click();

  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/1 de 2 filas/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByRole("cell", { name: "00123" })).toBeVisible();
});

test("selecciona, renombra y ordena sobre versiones reales de DuckDB", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "orden.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,valor\n3,B\n1,A\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("orden.csv: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /seleccionar columnas/i }).click();
  await page.getByLabel("valor").uncheck();
  await page.getByRole("button", { name: /renombrar columna/i }).click();
  await page.getByLabel("Nombre nuevo 2").fill("codigo");
  await page.getByRole("button", { name: /ordenar filas/i }).click();
  await page.getByLabel("Dirección de orden 3").selectOption("desc");
  await page.getByRole("button", { name: /vista previa/i }).click();

  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/2 de 2 filas/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByRole("columnheader", { name: "codigo" })).toBeVisible();
  await expect(preview.getByRole("row").nth(1).getByRole("cell")).toHaveText("3");
  await expect(preview.getByRole("row").nth(2).getByRole("cell")).toHaveText("1");
});
