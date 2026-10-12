import { expect, test, type Page } from "@playwright/test";

// E3 resto: cuota observable, navegación consistente y contexto persistente.
// La evidencia OPFS vive en ADR-0003 (sodecide no adoptarlo en R1).
async function cleanStorage(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("dataforge");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await cleanStorage(page);
});

test("muestra la cuota real del navegador", async ({ page }) => {
  const inspector = page.locator('aside[aria-label="Inspector"]');
  await expect(inspector.getByText(/usados de/)).toBeVisible({ timeout: 15_000 });
  await expect(inspector.getByText(/MB/)).toBeVisible();
  await expect(
    inspector.getByText(/nunca se pierde en silencio/i),
  ).toBeVisible();
});

test("la navegación conserva el proyecto activo", async ({ page }) => {
  const name = `Nav-${Date.now()}`;
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(name);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(`Proyecto: ${name}`)).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /^datos$/i }).click();
  await expect(
    page.getByText(`Trabajando en el proyecto «${name}»`),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^inicio$/i }).click();
  await expect(page.getByText(`Proyecto: ${name}`)).toBeVisible();
  const inspector = page.locator('aside[aria-label="Inspector"]');
  await expect(inspector.getByText(name, { exact: true })).toBeVisible();
});
