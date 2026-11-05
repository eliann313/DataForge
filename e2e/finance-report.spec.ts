import { expect, test } from "@playwright/test";

test("genera un informe local por rango inclusivo con transferencias aparte", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^finanzas$/i }).click();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("dataforge-finance");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
  await page.getByRole("button", { name: /^finanzas$/i }).click();

  const form = page.locator('section[aria-labelledby="movimiento"]');
  await form.getByLabel("Descripción").fill("Ingreso ARS");
  await form.getByLabel("Importe").fill("100");
  await form.getByLabel("Categoría").fill("Trabajo");
  await form.getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(page.getByText("Movimiento guardado correctamente.")).toBeVisible();

  await form.getByLabel("Descripción").fill("Ingreso USD");
  await form.getByLabel("Moneda").selectOption("USD");
  await form.getByLabel("Importe").fill("10");
  await form.getByLabel("Categoría").fill("Exterior");
  await form.getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(page.getByText("Movimiento guardado correctamente.")).toBeVisible();
  await form.getByLabel("Moneda").selectOption("ARS");

  const accounts = page.locator('section[aria-labelledby="cuentas"]');
  await accounts.getByLabel("Nombre de la cuenta").fill("Billetera destino");
  await accounts.getByRole("button", { name: "Agregar" }).click();
  await expect(accounts.getByText("Billetera destino")).toBeVisible();
  await form.getByLabel("Descripción").fill("Traspaso propio");
  await form.getByLabel("Tipo").selectOption("transferencia");
  await form.getByLabel("Importe").fill("25");
  await form.getByRole("combobox", { name: "Cuenta", exact: true }).selectOption({ label: "Cuenta principal" });
  await form.getByRole("combobox", { name: "Cuenta destino" }).selectOption({ label: "Billetera destino" });
  await form.getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(page.getByText("Movimiento guardado correctamente.")).toBeVisible();

  const year = await page.evaluate(() => new Date().getFullYear());
  const report = page.locator('section[aria-labelledby="finance-report-title"]');
  await report.getByLabel("Fecha inicial").fill(`${year}-01-01`);
  await report.getByLabel("Fecha final").fill(`${year}-12-31`);

  const popupReady = page.waitForEvent("popup");
  await report.getByRole("button", { name: /generar e imprimir/i }).click();
  const output = await popupReady;
  await expect(output.getByRole("heading", { name: "Informe financiero" })).toBeVisible();
  await expect(output.getByRole("heading", { name: "Transferencias propias (excluidas del resumen)" })).toBeVisible();
  await expect(output.getByText(/Traspaso propio.*Cuenta principal.*Billetera destino/)).toBeVisible();
  await expect(output.getByText("Trabajo")).toBeVisible();
  await expect(output.getByText("Exterior")).toBeVisible();

  const summary = output.getByRole("table", { name: "Resumen por moneda" });
  const ars = summary.getByRole("row", { name: /ARS/ });
  const usd = summary.getByRole("row", { name: /USD/ });
  await expect(ars).toContainText("100,00");
  await expect(ars).toContainText("0,00");
  await expect(usd).toContainText("10,00");
});
