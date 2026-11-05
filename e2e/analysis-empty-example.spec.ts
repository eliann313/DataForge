import { expect, test } from "@playwright/test";

test("desde Análisis sin dataset carga el ejemplo real de ventas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^análisis$/i }).click();

  const analysis = page.locator("main");
  await expect(analysis.getByRole("heading", { name: "Tu análisis comienza con un dataset" })).toBeVisible();
  await analysis.getByRole("button", { name: "Probar un ejemplo" }).click();

  await expect(page.getByRole("heading", { name: "Datos", exact: true })).toBeVisible();
  await expect(page.getByText("ventas-demo.csv: 12 filas, 6 columnas")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("table").filter({ hasText: "Panadería" })).toBeVisible();
});
