import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("permite crear un informe local y exportar HTML imprimible", async ({ page }) => {
  await page.goto("/");
  const project = `Reports-${Date.now()}`;
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(project);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(`Proyecto: ${project}`)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^informes$/i }).click();
  await page.getByRole("button", { name: /nuevo informe/i }).click();
  await page.getByLabel(/título del informe/i).fill("Resumen de prueba");
  await page.getByRole("button", { name: /\+ observaciones/i }).click();
  await page.getByRole("textbox", { name: "Observaciones" }).fill("Revisar el comportamiento del trimestre.");
  await page.getByRole("button", { name: /^guardar$/i }).click();
  await expect(page.getByRole("status")).toContainText("guardado en este dispositivo");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /exportar html/i }).click();
  const download = await downloadPromise;
  const contents = await readFile(await download.path(), "utf8");
  expect(contents).toContain("Resumen de prueba");
  expect(contents).toContain("window.print()");
  expect(contents).toContain("Revisar el comportamiento del trimestre.");
});
