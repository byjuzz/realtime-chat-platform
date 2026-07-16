import { readFileSync, existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

const envFile = loadEnvFile(new URL("./.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    // Postgres real y compartido entre tests: se corre secuencial para
    // evitar carreras sobre el mismo estado de base de datos.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
    env: {
      ...envFile,
      DATABASE_URL: envFile.DATABASE_URL_TEST ?? process.env.DATABASE_URL_TEST ?? "",
    },
  },
});
