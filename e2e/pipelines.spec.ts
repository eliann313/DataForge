import path from "node:path";
import { expect, test } from "@playwright/test";

test("guarda una definición en el proyecto y la recupera al recargar", async ({ page }) => {
  const project = `Pipelines-${Date.now()}`;
  await page.goto("/");
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(project);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(project, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/duplicadas.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("duplicadas.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /eliminar duplicados/i }).click();
  await page.getByRole("button", { name: /guardar definición/i }).click();
  await expect(page.locator("main").getByRole("status")).toContainText(/guardada en/i, { timeout: 15_000 });

  await page.reload();
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/duplicadas.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("duplicadas.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const saved = page.getByLabel("Definición guardada");
  await expect(saved.locator("option", { hasText: "Preparación" })).toBeAttached({ timeout: 15_000 });
  await saved.selectOption({ label: "Preparación" });
  await page.getByRole("button", { name: /cargar definición/i }).click();
  await expect(page.locator("main").getByRole("status")).toContainText(/validada contra el esquema actual/i);
  await page.getByRole("button", { name: /vista previa/i }).click();
  await expect(page.locator('section[aria-labelledby="pipeline-vista-previa"]').getByText(/2 de 3 filas/)).toBeVisible({ timeout: 30_000 });
});

test("crea una versión derivada sin alterar la fuente y permite activarla otra vez", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/duplicadas.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("duplicadas.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /eliminar duplicados/i }).click();
  await page.getByRole("button", { name: /vista previa/i }).click();
  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/2 de 3 filas/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /ejecutar y crear versión/i }).click();
  const versions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(versions.getByText(/Preparación · versión 1 \(activa\)/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^análisis$/i }).click();
  const analysis = page.locator("main");
  await analysis.getByLabel(/columna numérica/i).selectOption("id");
  await analysis.getByRole("button", { name: /^calcular$/i }).first().click();
  await expect(analysis.getByRole("row", { name: /válidos \/ faltantes/i })).toContainText("2 / 0", { timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const source = versions.getByRole("row", { name: /duplicadas\.csv/ });
  await source.getByRole("button", { name: /usar versión/i }).click();
  await expect(versions.getByText("duplicadas.csv (activa)")).toBeVisible();

  await page.getByRole("button", { name: /^análisis$/i }).click();
  await analysis.getByLabel(/columna numérica/i).selectOption("id");
  await analysis.getByRole("button", { name: /^calcular$/i }).first().click();
  await expect(analysis.getByRole("row", { name: /válidos \/ faltantes/i })).toContainText("3 / 0", { timeout: 30_000 });

  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/numeros.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("numeros.csv: 5 filas, 3 columnas")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const replacementVersions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(replacementVersions.getByRole("row")).toHaveCount(4);
  await expect(replacementVersions.getByText("numeros.csv (activa)")).toBeVisible();
  await expect(replacementVersions.getByText(/Preparación/)).toBeVisible();
  const preservedSource = replacementVersions.getByRole("row").nth(1);
  await preservedSource.getByRole("button", { name: /usar versión/i }).click();
  await expect(replacementVersions.getByText("duplicadas.csv (activa)")).toBeVisible();
});

test("mantiene varias fuentes por proyecto y aísla el proyecto activo", async ({ page }) => {
  const firstProject = `Fuentes-${Date.now()}`;
  const otherProject = `Otro-${Date.now()}`;
  await page.goto("/");
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(firstProject);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await expect(page.getByText(firstProject, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/duplicadas.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("duplicadas.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/numeros.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("numeros.csv: 5 filas, 3 columnas")).toBeVisible({ timeout: 30_000 });

  const datasets = page.locator('section[aria-labelledby="datasets-sesion"]');
  await expect(datasets.getByRole("listitem")).toHaveCount(2);
  const firstSource = datasets.getByRole("listitem").filter({ hasText: "duplicadas.csv" }).first();
  await firstSource.getByRole("button", { name: /activar dataset/i }).click();
  await expect(page.getByText("duplicadas.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^inicio$/i }).click();
  await page.getByLabel(/nombre de proyecto nuevo/i).fill(otherProject);
  await page.getByRole("button", { name: /^crear proyecto$/i }).click();
  await page.getByRole("button", { name: /^datos$/i }).click();
  await expect(datasets.getByText(/No hay fuentes cargadas/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^inicio$/i }).click();
  await page.getByRole("radio", { name: `Abrir ${firstProject}` }).check();
  await page.getByRole("button", { name: /^datos$/i }).click();
  await expect(datasets.getByRole("listitem")).toHaveCount(2);
  await expect(datasets.getByRole("listitem").filter({ hasText: "duplicadas.csv" }).first()).toContainText("(activa)");
});

test("APPEND mapea esquemas diferentes y conserva filas repetidas con UNION ALL", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "origen-a.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,valor\n1,A\n1,A\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("origen-a.csv: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "origen-b.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,etiqueta\n2,B\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("origen-b.csv: 1 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const combinations = page.locator('section[aria-labelledby="combinaciones-datasets"]');
  await combinations.getByLabel("Fuente izquierda").selectOption({ label: "origen-a.csv · 2 filas" });
  await combinations.getByLabel("Fuente derecha").selectOption({ label: "origen-b.csv · 1 filas" });
  await expect(combinations.getByLabel("Nombre de salida APPEND 1")).toBeVisible();
  await combinations.getByRole("button", { name: /vista previa append/i }).click();

  const preview = combinations.locator('section[aria-labelledby="append-vista-previa"]');
  await expect(preview.getByText(/resultado: 3/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByRole("cell", { name: "1", exact: true })).toHaveCount(2);
  await combinations.getByRole("button", { name: /crear versión append/i }).click();
  const versions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(versions.getByText(/Anexar fuentes · APPEND \(activa\)/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^datos$/i }).click();
  const datasets = page.locator('section[aria-labelledby="datasets-sesion"]');
  page.once("dialog", (dialog) => void dialog.accept());
  await datasets.getByRole("listitem").filter({ hasText: "origen-a.csv" }).getByRole("button", { name: /quitar de la sesión/i }).click();
  await expect(datasets.getByRole("listitem")).toHaveCount(1);
  await expect(datasets.getByText(/origen-b\.csv/)).toBeVisible();
  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await expect(versions.getByRole("row")).toHaveCount(2);
  await expect(versions.getByText(/Anexar fuentes · APPEND/)).toHaveCount(0);
});

test("JOIN exige cardinalidad, muestra fanout y bloquea su creación hasta confirmarlo", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "clientes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,nombre\n1,Ana\n2,Beto\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("clientes.csv: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "movimientos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("customer_id,importe\n1,10\n1,20\n2,5\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("movimientos.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  const combinations = page.locator('section[aria-labelledby="combinaciones-datasets"]');
  await combinations.getByRole("button", { name: /^join$/i }).click();
  await combinations.getByLabel("Fuente izquierda").selectOption({ label: "clientes.csv · 2 filas" });
  await combinations.getByLabel("Fuente derecha").selectOption({ label: "movimientos.csv · 3 filas" });
  await combinations.getByLabel("Tipo de JOIN").selectOption("left");
  await combinations.getByLabel("Cardinalidad del JOIN").selectOption("many-to-one");
  await combinations.getByRole("button", { name: /agregar par de claves/i }).click();
  await combinations.getByLabel("Clave izquierda JOIN 1").selectOption("id");
  await combinations.getByLabel("Clave derecha JOIN 1").selectOption("customer_id");
  await combinations.getByRole("button", { name: /vista previa join/i }).click();
  await expect(combinations.getByRole("status")).toContainText(/claves únicas en el lado derecha/i, { timeout: 30_000 });
  await expect(page.locator('section[aria-labelledby="pipeline-versiones"] tbody tr')).toHaveCount(2);

  await combinations.getByLabel("Cardinalidad del JOIN").selectOption("one-to-many");
  await combinations.getByRole("button", { name: /vista previa join/i }).click();
  const preview = combinations.locator('section[aria-labelledby="join-vista-previa"]');
  await expect(preview.getByText(/resultado: 3/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByText(/repite 1 filas de la izquierda/i)).toBeVisible();
  const create = combinations.getByRole("button", { name: /crear versión join/i });
  await expect(create).toBeDisabled();
  await combinations.getByLabel(/confirmo que revisé la vista previa/i).check();
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.locator('section[aria-labelledby="pipeline-versiones"]').getByText(/Relacionar fuentes · JOIN \(activa\)/)).toBeVisible({ timeout: 30_000 });
});

test("una definición inválida no crea ni activa una versión", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles(path.resolve("public/demo-data/duplicadas.csv"));
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("duplicadas.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /renombrar columna/i }).click();
  await page.getByLabel("Columna a renombrar 1").selectOption("id");
  await page.getByLabel("Nombre nuevo 1").fill("valor");
  await page.getByRole("button", { name: /ejecutar y crear versión/i }).click();

  await expect(page.locator("main").getByRole("status")).toContainText(/Ya existe una columna/);
  const versions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(versions.getByRole("row")).toHaveCount(2);
  await expect(versions.getByText("duplicadas.csv (activa)")).toBeVisible();
});

test("un filtro de texto conserva códigos numéricos con ceros a la izquierda", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "codigos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("codigo\n00123\nX\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("codigos.csv: 2 filas, 1 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /agregar filtro/i }).click();
  await page.getByLabel("Operador del filtro 1").selectOption("eq");
  await page.getByLabel("Valor del filtro 1").fill("00123");
  await page.getByRole("button", { name: /vista previa/i }).click();

  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/1 de 2 filas/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByRole("cell", { name: "00123" })).toBeVisible();
});

test("selecciona, renombra y ordena sobre versiones reales de DuckDB", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "orden.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,valor\n3,B\n1,A\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("orden.csv: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /seleccionar columnas/i }).click();
  await page.getByLabel("valor").uncheck();
  await page.getByRole("button", { name: /renombrar columna/i }).click();
  await page.getByLabel("Nombre nuevo 2").fill("codigo");
  await page.getByRole("button", { name: /ordenar filas/i }).click();
  await page.getByLabel("Dirección de orden 3").selectOption("desc");
  await page.getByRole("button", { name: /vista previa/i }).click();

  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/2 de 2 filas/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByRole("columnheader", { name: "codigo" })).toBeVisible();
  await expect(preview.getByRole("row").nth(1).getByRole("cell")).toHaveText("3");
  await expect(preview.getByRole("row").nth(2).getByRole("cell")).toHaveText("1");
});

test("quita filas con nulos en las columnas seleccionadas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "nulos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,valor\n1,A\n,B\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("nulos.csv: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /quitar filas con nulos/i }).click();
  await page.getByRole("button", { name: /vista previa/i }).click();

  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/1 de 2 filas/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByRole("row").nth(1).getByRole("cell")).toHaveText(["1", "A"]);
});

test("reemplaza nulos con un valor validado según el tipo numérico", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "importes-nulos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,importe\n1,10\n2,\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("importes-nulos.csv: 2 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /reemplazar nulos/i }).click();
  await page.getByLabel("Columna con nulos 1").selectOption("importe");
  await page.getByLabel("Valor de reemplazo 1").fill("0");
  await page.getByRole("button", { name: /vista previa/i }).click();

  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/2 de 2 filas/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByRole("row").nth(2).getByRole("cell")).toHaveText(["2", "0"]);
});

test("normaliza espacios, mayúsculas y texto vacío en una versión derivada", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "texto.csv",
    mimeType: "text/csv",
    buffer: Buffer.from('nombre\n"  Alice  "\n"   "\n"BOB"\n', "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("texto.csv: 3 filas, 1 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /normalizar texto/i }).click();
  await page.getByLabel("Mayúsculas y minúsculas 1").selectOption("lower");
  await page.getByRole("button", { name: /vista previa/i }).click();

  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/3 de 3 filas/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByRole("row").nth(1).getByRole("cell")).toHaveText("alice");
  await expect(preview.getByRole("row").nth(2).getByRole("cell")).toHaveText("nulo");
  await expect(preview.getByRole("row").nth(3).getByRole("cell")).toHaveText("bob");
});

test("convierte texto a entero solo después de validar y conserva la fuente", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "codigos-con-estado.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("codigo,estado\n00123,ok\n00007,ok\nX,omitir\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("codigos-con-estado.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /agregar filtro/i }).click();
  await page.getByLabel("Columna del filtro 1").selectOption("estado");
  await page.getByLabel("Operador del filtro 1").selectOption("eq");
  await page.getByLabel("Valor del filtro 1").fill("ok");
  await page.getByRole("button", { name: /convertir tipo/i }).click();
  await page.getByLabel("Columna a convertir 2").selectOption("codigo");
  await page.getByRole("button", { name: /vista previa/i }).click();

  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/2 de 3 filas/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByRole("cell", { name: "123", exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "7", exact: true })).toBeVisible();

  await page.getByRole("button", { name: /ejecutar y crear versión/i }).click();
  const versions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(versions.getByText(/Preparación · versión 1 \(activa\)/)).toBeVisible({ timeout: 30_000 });
  await expect(versions.getByRole("row", { name: /codigos-con-estado\.csv 3 2 Fuente original/ })).toBeVisible();
});

test("rechaza conversiones incompatibles sin crear ni activar una versión", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "codigos-invalidos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("codigo\n00123\nABC\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("codigos-invalidos.csv: 2 filas, 1 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /convertir tipo/i }).click();
  await page.getByLabel("Columna a convertir 1").selectOption("codigo");
  await page.getByRole("button", { name: /vista previa/i }).click();
  const status = page.locator("main").getByRole("status");
  await expect(status).toContainText(/se rechazó: 1 fila/i, { timeout: 30_000 });

  await page.getByRole("button", { name: /ejecutar y crear versión/i }).click();
  await expect(status).toContainText(/se rechazó: 1 fila/i, { timeout: 30_000 });
  const versions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(versions.getByRole("row")).toHaveCount(2);
  await expect(versions.getByText("codigos-invalidos.csv (activa)")).toBeVisible();
});

test("rechaza una conversión decimal que redondearía valores de texto", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "decimales.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("importe,estado\n10.125,ok\n2.50,ok\nvalor,omitir\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("decimales.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /agregar filtro/i }).click();
  await page.getByLabel("Columna del filtro 1").selectOption("estado");
  await page.getByLabel("Operador del filtro 1").selectOption("eq");
  await page.getByLabel("Valor del filtro 1").fill("ok");
  await page.getByRole("button", { name: /convertir tipo/i }).click();
  await page.getByLabel("Columna a convertir 2").selectOption("importe");
  await page.getByLabel("Tipo de destino 2").selectOption("DECIMAL");
  await page.getByRole("button", { name: /vista previa/i }).click();

  await expect(page.locator("main").getByRole("status")).toContainText(/se rechazó: 1 fila/i, { timeout: 30_000 });
});

test("normaliza fechas de texto con un formato de origen elegido", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "fechas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("fecha,estado\n31/12/2025,ok\n01/02/2026,ok\nfecha-invalida,omitir\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("fechas.csv: 3 filas, 2 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /agregar filtro/i }).click();
  await page.getByLabel("Columna del filtro 1").selectOption("estado");
  await page.getByLabel("Operador del filtro 1").selectOption("eq");
  await page.getByLabel("Valor del filtro 1").fill("ok");
  await page.getByRole("button", { name: /normalizar fecha/i }).click();
  await page.getByLabel("Columna de fecha 2").selectOption("fecha");
  await page.getByLabel("Formato de fecha 2").selectOption("DD/MM/YYYY");
  await page.getByRole("button", { name: /vista previa/i }).click();

  const preview = page.locator('section[aria-labelledby="pipeline-vista-previa"]');
  await expect(preview.getByText(/2 de 3 filas/)).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByRole("row").nth(1).getByRole("cell").first()).toHaveText("2025-12-31");
  await expect(preview.getByRole("row").nth(2).getByRole("cell").first()).toHaveText("2026-02-01");
});

test("rechaza fechas inválidas sin crear una versión derivada", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^datos$/i }).click();
  await page.getByRole("button", { name: /inicializar motor/i }).click();
  await expect(page.getByText("Estado: Motor listo")).toBeVisible({ timeout: 120_000 });
  await page.locator("#csv-file").setInputFiles({
    name: "fechas-invalidas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("fecha\n31/02/2025\n", "utf8"),
  });
  await page.getByRole("button", { name: /importar archivo/i }).click();
  await expect(page.getByText("fechas-invalidas.csv: 1 filas, 1 columnas")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /^transformaciones$/i }).click();
  await page.getByRole("button", { name: /normalizar fecha/i }).click();
  await page.getByLabel("Columna de fecha 1").selectOption("fecha");
  await page.getByLabel("Formato de fecha 1").selectOption("DD/MM/YYYY");
  await page.getByRole("button", { name: /vista previa/i }).click();

  await expect(page.locator("main").getByRole("status")).toContainText(/normalización.*se rechazó: 1 fila/i, { timeout: 30_000 });
  const versions = page.locator('section[aria-labelledby="pipeline-versiones"]');
  await expect(versions.getByRole("row")).toHaveCount(2);
  await expect(versions.getByText("fechas-invalidas.csv (activa)")).toBeVisible();
});
