import { expect, test } from "@playwright/test";

// E3.2: el shell carga con navegación documentada, CTAs solo con
// capacidades existentes y gestión de proyectos visible.
test("el shell muestra navegación, CTAs y proyectos", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /saltar al contenido/i })).toBeAttached();
  await expect(page.getByRole("button", { name: /importar datos/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /probar un ejemplo/i })).toBeVisible();
  // Secciones futuras marcadas, no funcionales.
  const labNav = page.getByRole("button", { name: /laboratorio/i });
  await expect(labNav).toContainText("En preparación");
  await expect(page.getByRole("button", { name: /^datos$/i })).toBeVisible();
  // Proyectos visibles sin cuenta.
  await expect(page.getByRole("heading", { name: /mis proyectos/i })).toBeVisible();
});
