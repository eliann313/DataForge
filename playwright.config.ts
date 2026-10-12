import { defineConfig, devices } from "@playwright/test";

// STATIC_URL (0A.6): smoke contra el build exportado en lugar del dev server.
const staticURL = process.env.STATIC_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Suite con WASM pesado (36 MB por contexto): 3 workers evitan contención.
  workers: 3,
  reporter: "list",
  use: {
    baseURL: staticURL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // 0A.5: segundo navegador de escritorio para compatibilidad.
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: staticURL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
