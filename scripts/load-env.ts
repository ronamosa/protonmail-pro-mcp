import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnvFile(path = resolve(projectRoot, ".env")): boolean {
  if (!existsSync(path)) return false;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }

  return true;
}

export function loadMcpEnv(path = resolve(projectRoot, ".cursor/mcp.json")): boolean {
  if (!existsSync(path)) return false;

  const config = JSON.parse(readFileSync(path, "utf8")) as {
    mcpServers?: Record<string, { env?: Record<string, string> }>;
  };

  const servers = config.mcpServers ?? {};
  const env = Object.values(servers).find((s) => s.env)?.env;
  if (!env) return false;

  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) process.env[key] = value;
  }

  return true;
}

export function loadProjectEnv(): boolean {
  return loadEnvFile() || loadMcpEnv();
}

export { projectRoot };
