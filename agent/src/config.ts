import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { EngineId } from "./processes/registry";

export type AgentConfig = {
  deviceId: string;
  agentToken: string;
  ingestUrl: string;
  logPaths?: Partial<Record<EngineId, string>>;
};

export function defaultConfigPath(): string {
  return join(homedir(), ".renderwatch", "config.json");
}

export async function loadConfig(path: string): Promise<AgentConfig | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.deviceId === "string" &&
      typeof parsed.agentToken === "string" &&
      typeof parsed.ingestUrl === "string"
    ) {
      return parsed as AgentConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveConfig(path: string, config: AgentConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 });
}
