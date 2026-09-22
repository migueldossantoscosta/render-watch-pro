import { rm } from "node:fs/promises";
import { defaultConfigPath, loadConfig, saveConfig, type AgentConfig } from "./config";
import { ensurePaired, promptForPairingCode } from "./pairing";
import { createLoopState, runTick } from "./loop";
import { IngestClient } from "./ingest/client";

const PAIR_URL = process.env.RENDERWATCH_PAIR_URL ?? "https://YOUR-PROJECT.functions.supabase.co/pair";
const TICK_MS = 1000;

async function runAgentSession(configPath: string): Promise<"reauth"> {
  const config: AgentConfig = await ensurePaired({
    configPath,
    pairUrl: PAIR_URL,
    loadConfig,
    saveConfig,
    promptForCode: promptForPairingCode,
  });

  const state = createLoopState();
  let tokenRejected = false;
  const client = new IngestClient({
    ingestUrl: config.ingestUrl,
    agentToken: config.agentToken,
    onTokenRejected: () => {
      tokenRejected = true;
    },
    onDrop: () => console.warn("Ingest queue full; dropped the oldest sample."),
  });

  console.log("RenderWatch agent started. Streaming telemetry every", TICK_MS, "ms.");

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      if (tokenRejected) {
        clearInterval(interval);
        console.error("Agent token was rejected. Re-pairing...");
        await rm(configPath, { force: true });
        resolve("reauth");
        return;
      }
      try {
        const payload = await runTick(config, state);
        client.enqueue(payload);
        await client.flush();
      } catch (err) {
        console.error("Tick failed:", err);
      }
    }, TICK_MS);
  });
}

async function main() {
  const configPath = defaultConfigPath();
  for (;;) {
    await runAgentSession(configPath);
  }
}

main();
