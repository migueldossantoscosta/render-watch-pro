import type { AgentConfig } from "./config";

export type PairResponse = { device_id: string; agent_token: string };

export async function pairDevice(
  pairingCode: string,
  pairUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentConfig> {
  const response = await fetchImpl(pairUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairing_code: pairingCode }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Pairing failed (${response.status}): ${body || response.statusText}`);
  }
  const data = (await response.json()) as PairResponse;
  return {
    deviceId: data.device_id,
    agentToken: data.agent_token,
    ingestUrl: pairUrl.replace(/\/pair$/, "/ingest"),
  };
}

export async function promptForPairingCode(): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Enter the pairing code shown on the RenderWatch dashboard: ");
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function ensurePaired(options: {
  configPath: string;
  pairUrl: string;
  loadConfig: (path: string) => Promise<AgentConfig | null>;
  saveConfig: (path: string, config: AgentConfig) => Promise<void>;
  promptForCode: () => Promise<string>;
  fetchImpl?: typeof fetch;
}): Promise<AgentConfig> {
  const existing = await options.loadConfig(options.configPath);
  if (existing) return existing;
  const code = await options.promptForCode();
  const config = await pairDevice(code, options.pairUrl, options.fetchImpl ?? fetch);
  await options.saveConfig(options.configPath, config);
  return config;
}
