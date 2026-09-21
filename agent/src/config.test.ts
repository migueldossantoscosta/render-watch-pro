import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, type AgentConfig } from "./config";

describe("config", () => {
  test("saves and loads a config round-trip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "renderwatch-"));
    const path = join(dir, "config.json");
    const config: AgentConfig = {
      deviceId: "device-1",
      agentToken: "token-1",
      ingestUrl: "https://example.com/ingest",
    };
    try {
      await saveConfig(path, config);
      const loaded = await loadConfig(path);
      expect(loaded).toEqual(config);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns null when the config file does not exist", async () => {
    const loaded = await loadConfig(join(tmpdir(), "renderwatch-missing", "config.json"));
    expect(loaded).toBeNull();
  });

  test("returns null when the config file has the wrong shape", async () => {
    const dir = await mkdtemp(join(tmpdir(), "renderwatch-"));
    const path = join(dir, "config.json");
    try {
      await Bun.write(path, JSON.stringify({ deviceId: "only-this" }));
      const loaded = await loadConfig(path);
      expect(loaded).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
