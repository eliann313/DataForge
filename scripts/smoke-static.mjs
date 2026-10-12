// Orquestador del smoke estático (0A.6): build ya hecho por quien invoca,
// levanta serve-out, corre la E2E Chromium contra out/ y apaga el servidor.
// Uso: npm run smoke:static
import { spawn } from "node:child_process";
import { join } from "node:path";

const playwrightCli = join(
  process.cwd(),
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

const PORT = 3100;
const server = spawn(
  process.execPath,
  ["scripts/serve-out.mjs", "out", String(PORT)],
  { stdio: "inherit" },
);

async function waitForReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok) return;
    } catch {
      // Reintenta hasta el deadline.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("serve-out no respondió a tiempo");
}

let code = 1;
try {
  await waitForReady();
  code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [playwrightCli, "test", "--project=chromium"],
      {
        stdio: "inherit",
        env: { ...process.env, STATIC_URL: `http://127.0.0.1:${PORT}` },
      },
    );
    child.on("exit", (c) => resolve(c ?? 1));
  });
} finally {
  server.kill();
}
process.exit(code);
