import { expect, test, type Page } from "@playwright/test";

// E3.2: CRUD de proyectos/carpetas con persistencia tras recarga y flujo de
// ejemplo ficticio. Nombres únicos por corrida para aislar el estado IndexedDB.
let seq = 0;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${seq++}`;

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

async function createProject(page: Page, name: string) {
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(name);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.beforeEach(async ({ page }) => {
  await cleanStorage(page);
});

test("crea proyecto y carpeta, recarga y los recupera", async ({ page }) => {
  const folder = uid("Carpeta");
  const project = uid("Proyecto");

  await page.getByLabel(/nombre de carpeta nueva/i).fill(folder);
  await page.getByRole("button", { name: /^crear carpeta$/i }).click();
  await expect(page.getByText(folder, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });

  await createProject(page, project);
  // Mueve el proyecto a la carpeta.
  const projectRow = page.locator("li", { hasText: project }).last();
  await projectRow.locator("select").first().selectOption({ label: folder });
  await expect(projectRow.getByText(`en ${folder}`, { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByText(folder, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(project, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  // El proyecto activo se conserva.
  await expect(page.getByText(`Proyecto: ${project}`)).toBeVisible();
});

test("renombra y elimina con confirmación", async ({ page }) => {
  const project = uid("Proyecto");
  await createProject(page, project);

  const row = page.locator("li", { hasText: project }).last();
  await row.getByRole("button", { name: /renombrar/i }).click();
  await page.getByLabel(/nuevo nombre de proyecto/i).fill(`${project}-b`);
  await page.getByRole("button", { name: /^guardar$/i }).click();
  // El formulario se cierra solo si el guardado completa (sin falso positivo
  // por el valor del input).
  await expect(page.getByLabel(/nuevo nombre de proyecto/i)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByText(`Proyecto: ${project}-b`)).toBeVisible();

  const row2 = page.locator("li", { hasText: `${project}-b` }).last();
  await row2.getByRole("button", { name: /eliminar/i }).click();
  await page.getByRole("button", { name: /^eliminar$/i }).last().click();
  await expect(page.getByText(`${project}-b`, { exact: true })).toHaveCount(0);
  await expect(page.getByText("Sin proyecto abierto")).toBeVisible();
});

test("bloquea eliminar carpeta no vacía", async ({ page }) => {
  const folder = uid("Carpeta");
  const project = uid("Proyecto");
  await page.getByLabel(/nombre de carpeta nueva/i).fill(folder);
  await page.getByRole("button", { name: /^crear carpeta$/i }).click();
  await expect(page.getByText(folder, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await createProject(page, project);
  const projectRow = page.locator("li", { hasText: project }).last();
  await projectRow.locator("select").first().selectOption({ label: folder });

  const folderRow = page.locator("li", { hasText: folder }).first();
  await folderRow.getByRole("button", { name: /eliminar/i }).click();
  await page.getByRole("button", { name: /^eliminar$/i }).last().click();
  await expect(page.locator("main").getByRole("alert")).toContainText(/no está vacía/i, {
    timeout: 15_000,
  });
});

test("probar un ejemplo lo importa en Datos", async ({ page }) => {
  await page
    .getByRole("button", { name: /probar este ejemplo/i })
    .first()
    .click();
  // Navega a Datos e importa el CSV ficticio con la ruta general.
  await expect(page.getByText(/12 filas, 6 columnas/)).toBeVisible({
    timeout: 120_000,
  });
});
