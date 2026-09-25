import { describe, expect, test } from "bun:test";
import { ensurePaired, pairDevice } from "./pairing";
import type { AgentConfig } from "./config";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
    })) as unknown as typeof fetch;
}

describe("pairDevice", () => {
  test("returns agent config from a successful pairing response", async () => {
    const fetchImpl = fakeFetch(200, { device_id: "device-1", agent_token: "token-1" });
    const config = await pairDevice("ABCD1234", "https://example.com/functions/v1/pair", fetchImpl);
    expect(config).toEqual({
      deviceId: "device-1",
      agentToken: "token-1",
      ingestUrl: "https://example.com/functions/v1/ingest",
    });
  });

  test("throws when the pair URL does not end in /pair so no ingest URL can be derived, without spending a request", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ device_id: "device-1", agent_token: "token-1" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    await expect(
      pairDevice("ABCD1234", "https://example.com/functions/v1/pair/", fetchImpl),
    ).rejects.toThrow("https://example.com/functions/v1/pair/");
    expect(calls).toBe(0);
  });

  test("throws with the response status and body on failure", async () => {
    const fetchImpl = fakeFetch(404, "unknown pairing code");
    await expect(
      pairDevice("BAD", "https://example.com/functions/v1/pair", fetchImpl),
    ).rejects.toThrow("Pairing failed (404): unknown pairing code");
  });
});

describe("ensurePaired", () => {
  test("returns existing config without prompting", async () => {
    const existing: AgentConfig = {
      deviceId: "d1",
      agentToken: "t1",
      ingestUrl: "https://x/ingest",
    };
    let prompted = false;
    const config = await ensurePaired({
      configPath: "/tmp/whatever.json",
      pairUrl: "https://x/pair",
      loadConfig: async () => existing,
      saveConfig: async () => {},
      promptForCode: async () => {
        prompted = true;
        return "SHOULDNT";
      },
    });
    expect(config).toEqual(existing);
    expect(prompted).toBe(false);
  });

  test("prompts, pairs, and persists when no config exists", async () => {
    let saved: AgentConfig | undefined;
    const config = await ensurePaired({
      configPath: "/tmp/whatever.json",
      pairUrl: "https://x/functions/v1/pair",
      loadConfig: async () => null,
      saveConfig: async (_path, cfg) => {
        saved = cfg;
      },
      promptForCode: async () => "ABCD1234",
      fetchImpl: fakeFetch(200, { device_id: "d2", agent_token: "t2" }),
    });
    expect(config.deviceId).toBe("d2");
    expect(saved).toEqual(config);
  });
});
