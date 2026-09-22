import { rm } from "node:fs/promises";
import { defaultConfigPath, loadConfig, saveConfig, type AgentConfig } from "./config";
import { ensurePaired, promptForPairingCode } from "./pairing";
import { createLoopState, runTick } from "./loop";
import { IngestClient } from "./ingest/client";

const PAIR_URL =
  process.env.RENDERWATCH_PAIR_URL ?? "https://YOUR-PROJECT.supabase.co/functions/v1/pair";
const TICK_MS = 1000;

type SessionOutcome = "reauth" | "pairing-failed";

async function runAgentSession(configPath: string): Promise<SessionOutcome> {
  let config: AgentConfig;
  try {
    config = await ensurePaired({
      configPath,
      pairUrl: PAIR_URL,
      loadConfig,
      saveConfig,
      promptForCode: promptForPairingCode,
    });
  } catch (err) {
    // Nothing was saved on a failed attempt, so the next loop iteration re-prompts.
    console.error("Pairing failed:", err instanceof Error ? err.message : err);
    return "pairing-failed";
  }

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
    let ticking = false;
    const interval = setInterval(async () => {
      if (tokenRejected) {
        clearInterval(interval);
        console.error("Agent token was rejected. Re-pairing...");
        await rm(configPath, { force: true });
        resolve("reauth");
        return;
      }
      // A tick can outlast TICK_MS (PowerShell + nvidia-smi); skip overlapping runs.
      if (ticking) return;
      ticking = true;
      try {
        const payload = await runTick(config, state);
        client.enqueue(payload);
        await client.flush();
      } catch (err) {
        console.error("Tick failed:", err);
      } finally {
        ticking = false;
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

main().catch((err) => {
  console.error("Fatal agent error:", err);
  process.exit(1);
});
