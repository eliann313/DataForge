import { expect, test } from "@playwright/test";

// 0A.1: smoke del sitio generado. Verifica que la página técnica carga
// y declara su estado real (sin funcionalidades de producto).
test("el esqueleto 0A.1 carga y declara su alcance", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /esqueleto técnico/i }),
  ).toBeVisible();
  await expect(page.getByText(/Fuera de este alcance/i)).toBeVisible();
});
