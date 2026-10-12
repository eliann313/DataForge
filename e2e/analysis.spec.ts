import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

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

test("correlación justificada y hallazgos por reglas", async ({ page }) => {
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
