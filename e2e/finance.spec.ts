import { expect, test, type Page } from "@playwright/test";

// E6 / Finanzas Lite: CRUD manual con centavos exactos, resumen mensual por
// moneda sin conversión y persistencia tras recarga. Cada test parte con base
// vacía (contexto fresco + borrado explícito).
async function cleanFinance(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^finanzas$/i }).click();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("dataforge-finance");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await page.getByRole("button", { name: /^finanzas$/i }).click();
}

test.beforeEach(async ({ page }) => {
  await cleanFinance(page);
});

test("migra movimientos previos y presenta sus categorías históricas", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase("dataforge-finance"); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("La base quedó abierta")); });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dataforge-finance", 3);
      request.onupgradeneeded = () => { request.result.createObjectStore("transactions", { keyPath: "id" }); request.result.createObjectStore("accounts", { keyPath: "id" }); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction("transactions", "readwrite"); tx.objectStore("transactions").put({ id: "historic", date: "2024-03-01", description: "Café antiguo", kind: "gasto", amountMinor: 100, currency: "ARS", category: "  Café  ", notes: "", createdAt: "2024-03-01", updatedAt: "2024-03-01" }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.reload();
  await page.getByRole("button", { name: /^finanzas$/i }).click();
  const row = view(page).locator("tr", { hasText: "Café antiguo" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("  Café  ");
  await view(page).getByLabel("Descripción").fill("Nuevo gasto");
  await expect(view(page).locator('#categorias option[value="Café"]')).toHaveCount(1);
});

const view = (page: Page) => page.locator("main");

async function addMovement(
  page: Page,
  fields: { description: string; kind: "Ingreso" | "Gasto"; amount: string; currency: "ARS" | "USD"; category: string },
) {
  await view(page).getByLabel(/descripción/i).fill(fields.description);
  await view(page).locator('section[aria-labelledby="movimiento"]').getByRole("combobox").nth(0).selectOption(fields.kind === "Ingreso" ? "ingreso" : "gasto");
  await view(page).getByLabel(/importe/i).fill(fields.amount);
  await view(page).getByLabel(/moneda/i).selectOption(fields.currency);
  await view(page).getByLabel(/^categoría$/i).fill(fields.category);
  await view(page).getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(view(page).getByRole("status").filter({ hasText: "Movimiento guardado correctamente." })).toBeVisible({ timeout: 15_000 });
}

test("resume el mes por moneda con centavos exactos", async ({ page }) => {
  await addMovement(page, { description: "Sueldo", kind: "Ingreso", amount: "1000", currency: "ARS", category: "trabajo" });
  await addMovement(page, { description: "Nafta", kind: "Gasto", amount: "250,50", currency: "ARS", category: "transporte" });
  await addMovement(page, { description: "Freelance", kind: "Ingreso", amount: "200", currency: "USD", category: "trabajo" });

  const v = view(page);
  const resumen = v.locator('section[aria-labelledby="resumen"]');
  await expect(resumen.getByText(/Pesos argentinos/)).toBeVisible();
  await expect(resumen.getByText(/1\.000,00/)).toBeVisible();
  await expect(resumen.getByText(/250,50/)).toBeVisible();
  await expect(resumen.getByText(/749,50/)).toBeVisible();
  await expect(resumen.getByText(/Dólares/)).toBeVisible();
  const usdRows = resumen.locator("article").filter({ hasText: "Dólares" }).locator("dl > div");
  const ingresoUSD = usdRows.nth(0);
  const saldoUSD = usdRows.nth(3);
  await expect(ingresoUSD.getByText("Ingresos", { exact: true })).toBeVisible();
  await expect(ingresoUSD.getByText(/200,00/)).toBeVisible();
  await expect(saldoUSD.getByText("Saldo", { exact: true })).toBeVisible();
  await expect(saldoUSD.getByText(/200,00/)).toBeVisible();
});

test("0,10 + 0,20 = 0,30 (sin flotantes)", async ({ page }) => {
  await addMovement(page, { description: "A", kind: "Ingreso", amount: "0,10", currency: "ARS", category: "c" });
  await addMovement(page, { description: "B", kind: "Ingreso", amount: "0,20", currency: "ARS", category: "c" });
  const resumen = view(page).locator('section[aria-labelledby="resumen"]');
  const saldoARS = resumen.locator("article").filter({ hasText: "Pesos argentinos" }).locator("dl > div").nth(3);
  await expect(saldoARS.getByText("Saldo", { exact: true })).toBeVisible();
  await expect(saldoARS.getByText(/0,30/)).toBeVisible();
});

test("transfiere entre cuentas propias sin alterar ingresos ni gastos", async ({ page }) => {
  const cuentas = view(page).locator('section[aria-labelledby="cuentas"]');
  for (const nombre of ["Billetera", "Banco"]) {
    await cuentas.getByLabel("Nombre de la cuenta").fill(nombre);
    await cuentas.getByRole("button", { name: "Agregar" }).click();
    await expect(cuentas.getByText(nombre)).toBeVisible();
  }
  await view(page).getByLabel(/descripción/i).fill("Traspaso propio");
  await view(page).locator('section[aria-labelledby="movimiento"]').getByRole("combobox").nth(0).selectOption("transferencia");
  await view(page).getByLabel(/importe/i).fill("25,50");
  await view(page).getByLabel(/moneda/i).selectOption("ARS");
  await view(page).getByRole("combobox", { name: "Cuenta", exact: true }).selectOption({ label: "Billetera" });
  await view(page).getByRole("combobox", { name: "Cuenta destino" }).selectOption({ label: "Banco" });
  await view(page).getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(view(page).getByRole("status").filter({ hasText: "Movimiento guardado correctamente." })).toBeVisible({ timeout: 15_000 });

  const resumen = view(page).locator('section[aria-labelledby="resumen"]');
  const filasARS = resumen.locator("article").filter({ hasText: "Pesos argentinos" }).locator("dl > div");
  await expect(filasARS.nth(0)).toContainText("0,00");
  await expect(filasARS.nth(1)).toContainText("0,00");
  const cuentasTexto = await cuentas.innerText();
  expect(cuentasTexto).toMatch(/Billetera[\s\S]*-\$[\s\S]*25,50/);
  expect(cuentasTexto).toMatch(/Banco[\s\S]*25,50/);
});

test("pago de tarjeta reduce deuda y reintegro parcial queda separado de ingresos", async ({ page }) => {
  const cuentas = view(page).locator('section[aria-labelledby="cuentas"]');
  await cuentas.getByLabel("Nombre de la cuenta").fill("Visa");
  await cuentas.getByLabel("Tipo de cuenta").selectOption("card");
  await cuentas.getByRole("button", { name: "Agregar" }).click();
  await expect(cuentas.getByText("Visa · Tarjeta · ARS")).toBeVisible();
  const addForm = view(page).locator('section[aria-labelledby="movimiento"]');
  await expect(addForm.getByRole("combobox", { name: "Cuenta", exact: true })).toHaveValue("account-default");
  await addForm.getByLabel("Descripción").fill("Sueldo");
  await addForm.getByRole("combobox").nth(0).selectOption("ingreso");
  await addForm.getByLabel("Importe").fill("200");
  await addForm.getByLabel("Categoría").fill("Trabajo");
  await addForm.getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(view(page).getByRole("status").filter({ hasText: "Movimiento guardado correctamente." })).toBeVisible();

  await addForm.getByLabel("Descripción").fill("Compra con tarjeta");
  await addForm.getByRole("combobox").nth(0).selectOption("gasto");
  await addForm.getByLabel("Importe").fill("100");
  await addForm.getByLabel("Categoría").fill("Compras");
  await addForm.getByRole("combobox", { name: "Cuenta", exact: true }).selectOption({ label: "Visa" });
  await addForm.getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(view(page).getByRole("status").filter({ hasText: "Movimiento guardado correctamente." })).toBeVisible();

  await addForm.getByLabel("Descripción").fill("Pago Visa");
  await addForm.getByRole("combobox").nth(0).selectOption("transferencia");
  await addForm.getByLabel("Importe").fill("60");
  await addForm.getByRole("combobox", { name: "Cuenta", exact: true }).selectOption({ label: "Cuenta principal" });
  await addForm.getByLabel("Cuenta destino").selectOption({ label: "Visa" });
  await addForm.getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(view(page).getByRole("status").filter({ hasText: "Movimiento guardado correctamente." })).toBeVisible();

  await addForm.getByLabel("Descripción").fill("Devolución parcial");
  await addForm.getByRole("combobox").nth(0).selectOption("reintegro");
  await addForm.getByLabel("Importe").fill("20");
  await addForm.getByRole("combobox", { name: "Cuenta", exact: true }).selectOption({ label: "Visa" });
  const expenseId = await addForm.getByLabel("Gasto asociado").locator("option").filter({ hasText: "Compra con tarjeta" }).getAttribute("value");
  await addForm.getByLabel("Gasto asociado").selectOption(expenseId!);
  await addForm.getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(view(page).getByRole("status").filter({ hasText: "Movimiento guardado correctamente." })).toBeVisible();

  await expect(cuentas.getByText(/Deuda \$\s*20,00/)).toBeVisible();
  const ars = view(page).locator('section[aria-labelledby="resumen"] article').filter({ hasText: "Pesos argentinos" });
  const summary = await ars.innerText();
  expect(summary).toContain("Ingresos");
  expect(summary).toContain("200,00");
  expect(summary).toContain("Gastos");
  expect(summary).toContain("100,00");
  expect(summary).toContain("Reintegros");
  expect(summary).toContain("20,00");
});

test("edita y elimina con confirmación", async ({ page }) => {
  await addMovement(page, { description: "Viejo", kind: "Gasto", amount: "100", currency: "ARS", category: "c" });
  const row = view(page).locator("tr", { hasText: "Viejo" });
  await row.getByRole("button", { name: /editar/i }).click();
  await view(page).getByLabel(/importe/i).fill("150,25");
  await view(page).getByRole("button", { name: /guardar cambios/i }).click();
  await expect(view(page).getByRole("status").filter({ hasText: "Movimiento guardado correctamente." })).toBeVisible({ timeout: 15_000 });
  const movs = view(page).locator('section[aria-labelledby="movimientos"]');
  await expect(movs.getByText(/150,25/)).toBeVisible();

  const row2 = view(page).locator("tr", { hasText: "Viejo" });
  await row2.getByRole("button", { name: /eliminar/i }).click();
  await view(page).getByRole("button", { name: /^eliminar$/i }).last().click();
  await expect(view(page).getByText("Viejo", { exact: true })).toHaveCount(0);
});

test("duplica como alta nueva y permite marcar movimientos destacados", async ({ page }) => {
  await addMovement(page, { description: "Original", kind: "Gasto", amount: "12,50", currency: "ARS", category: "Café" });
  const original = view(page).locator("tr", { hasText: "Original" });
  await original.getByRole("button", { name: "Duplicar" }).click();
  await expect(view(page).getByRole("heading", { name: "Nuevo movimiento" })).toBeVisible();
  await expect(view(page).getByLabel("Descripción")).toHaveValue("Original");
  await view(page).getByLabel("Descripción").fill("Copia");
  await view(page).getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(view(page).getByRole("status").filter({ hasText: "Movimiento guardado correctamente." })).toBeVisible();
  const copy = view(page).locator("tr", { hasText: "Copia" });
  await copy.getByRole("button", { name: "Destacar Copia" }).click();
  await expect(view(page).locator('section[aria-labelledby="destacados"]')).toContainText("Copia");
  await page.reload();
  await page.getByRole("button", { name: /^finanzas$/i }).click();
  await expect(view(page).locator('section[aria-labelledby="destacados"]')).toContainText("Copia");
  await copy.getByRole("button", { name: "Quitar destacado Copia" }).click();
  await expect(view(page).locator('section[aria-labelledby="destacados"]')).toContainText("Marca movimientos");
});

test("rechaza importes inválidos con mensaje", async ({ page }) => {
  await view(page).getByLabel(/descripción/i).fill("Malo");
  await view(page).getByLabel(/importe/i).fill("abc");
  await view(page).getByLabel(/^categoría$/i).fill("c");
  await view(page).getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(view(page).getByRole("alert")).toContainText(/inválido/i, { timeout: 15_000 });
  await view(page).getByLabel(/importe/i).fill("0");
  await view(page).getByRole("button", { name: /guardar movimiento/i }).click();
  await expect(view(page).getByRole("alert")).toContainText(/mayor que cero/i, { timeout: 15_000 });
});

test("persiste tras recargar", async ({ page }) => {
  await addMovement(page, { description: "Persistente", kind: "Ingreso", amount: "500", currency: "ARS", category: "c" });
  await page.reload();
  await page.getByRole("button", { name: /^finanzas$/i }).click();
  await expect(view(page).getByText("Persistente", { exact: true })).toBeVisible({ timeout: 15_000 });
  const movs = view(page).locator('section[aria-labelledby="movimientos"]');
  await expect(movs.getByText(/500,00/)).toBeVisible();
});
