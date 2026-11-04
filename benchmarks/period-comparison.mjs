import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { chromium } from '@playwright/test';
(async () => {
  const records = ['id,fecha,importe'];
  for (let i = 0; i < 100000; i++) records.push(`${Math.floor(i / 2) + 1},2024-${i % 2 ? '02' : '01'}-15,${i % 2 ? 200 : 100}`);
  const data = Buffer.from(records.join('\n') + '\n');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(process.env.PERIOD_BENCH_URL ?? 'http://127.0.0.1:3102/');
    await page.getByRole('button', { name: /^datos$/i }).click();
    await page.getByRole('button', { name: /inicializar motor/i }).click();
    await page.getByText('Estado: Motor listo').waitFor();
    await page.locator('#csv-file').setInputFiles({ name: 'benchmark.csv', mimeType: 'text/csv', buffer: data });
    await page.getByRole('button', { name: /importar archivo/i }).click();
    await page.getByText('benchmark.csv: 100000 filas, 3 columnas').waitFor();
    await page.getByRole('button', { name: /^transformaciones$/i }).click();
    await page.getByLabel('Primera versión para comparar').selectOption({ label: 'benchmark.csv' });
    await page.getByLabel('Segunda versión para comparar').selectOption({ label: 'benchmark.csv' });
    await page.getByLabel('Columna de fecha para períodos').selectOption('fecha');
    await page.getByLabel('Medida para períodos').selectOption('importe');
    await page.getByLabel('Primer período desde').fill('2024-01-01');
    await page.getByLabel('Primer período hasta').fill('2024-01-31');
    await page.getByLabel('Segundo período desde').fill('2024-02-01');
    await page.getByLabel('Segundo período hasta').fill('2024-02-29');
    await page.getByLabel('Clave para comparar períodos').selectOption('id');
    await page.getByLabel(/Confirmo que todos los valores/).check();
    const button = page.getByRole('button', { name: 'Comparar períodos', exact: true });
    const table = page.getByRole('table', { name: 'Resultados por período' });
    const times = [];
    for (let i = 0; i < 6; i++) {
      await page.getByLabel('Primer período hasta').fill(i % 2 ? '2024-01-30' : '2024-01-31');
      await table.waitFor({ state: 'hidden' });
      const start = performance.now();
      await button.click();
      await table.waitFor({ state: 'visible' });
      const summary = await page.locator('section[aria-labelledby="comparar-versiones"]').innerText();
      if (!summary.includes('modificadas: 50000')) throw new Error('Claves inesperadas: ' + summary);
      const text = await table.innerText();
      if (!text.includes('50000') || !text.includes('5000000') || !text.includes('10000000')) throw new Error('Resultado de benchmark inesperado: ' + text);
      const elapsed = performance.now() - start;
      if (i) times.push(Math.round(elapsed));
    }
    const cpus = os.cpus();
    process.stdout.write(JSON.stringify({ rows: 100000, bytes: data.length, cpu: cpus[0]?.model, logicalCpus: cpus.length, memoryBytes: os.totalmem(), platform: `${os.type()} ${os.release()} ${os.arch()}`, node: process.version, chromium: browser.version(), warmup: 1, measured: times, medianMs: [...times].sort((a,b)=>a-b)[2] }) + '\n');
  } finally { await browser.close(); }
})().catch(e => { process.stderr.write(String(e.stack || e) + '\n'); process.exitCode = 1; });
