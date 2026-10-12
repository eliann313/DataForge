import { expect, test } from "@playwright/test";

// 0A.2: el motor no se inicializa al abrir la página (inicio diferido),
// se inicializa bajo demanda con consultas reales y el ciclo cerrar/reiniciar
// es recuperable.
test("el motor arranca diferido y el ciclo cerrar/reiniciar recupera", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();

  // Sin inicialización automática.
  await expect(page.getByText("Estado: Motor no inicializado")).toBeVisible();

  // Inicialización bajo demanda con ping real (SELECT 1 + version()).
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText(/Versión DuckDB:/)).toBeVisible();

  // Cierre libera el Worker.
  await page.getByRole("button", { name: /^cerrar$/i }).click();
  await expect(page.getByText("Estado: Motor cerrado")).toBeVisible();

  // Reinicio recupera un motor operativo.
  await page.getByRole("button", { name: /reiniciar/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({
    timeout: 120_000,
  });
});
