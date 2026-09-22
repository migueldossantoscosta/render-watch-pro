import { describe, expect, test } from "bun:test";
import { IngestClient } from "./client";

function fetchSequence(results: Array<{ status: number }>): typeof fetch {
  let i = 0;
  return (async () => {
    const result = results[Math.min(i, results.length - 1)];
    i += 1;
    return new Response("{}", { status: result.status });
  }) as unknown as typeof fetch;
}

describe("IngestClient", () => {
  test("sends queued payloads in order and drains the queue on success", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new IngestClient({ ingestUrl: "https://x/ingest", agentToken: "t", fetchImpl });
    client.enqueue({ telemetry: { gpu_temp_c: 60 } });
    client.enqueue({ events: [{ level: "info", source: "agent", message: "started" }] });
    await client.flush();
    expect(calls).toBe(2);
    expect(client.queueLength).toBe(0);
  });

  test("keeps a failed payload at the head of the queue and stops draining", async () => {
    const fetchImpl = fetchSequence([{ status: 500 }]);
    const client = new IngestClient({ ingestUrl: "https://x/ingest", agentToken: "t", fetchImpl });
    client.enqueue({ telemetry: { gpu_temp_c: 60 } });
    client.enqueue({ telemetry: { gpu_temp_c: 61 } });
    await client.flush();
    expect(client.queueLength).toBe(2);
  });

  test("drops the oldest payload once the queue exceeds maxQueueSize", () => {
    const dropped: unknown[] = [];
    const client = new IngestClient({
      ingestUrl: "https://x/ingest",
      agentToken: "t",
      maxQueueSize: 2,
      onDrop: (payload) => dropped.push(payload),
    });
    client.enqueue({ telemetry: { gpu_temp_c: 1 } });
    client.enqueue({ telemetry: { gpu_temp_c: 2 } });
    client.enqueue({ telemetry: { gpu_temp_c: 3 } });
    expect(client.queueLength).toBe(2);
    expect(dropped).toEqual([{ telemetry: { gpu_temp_c: 1 } }]);
  });

  test("calls onTokenRejected and stops draining on a 401", async () => {
    let rejected = false;
    const fetchImpl = fetchSequence([{ status: 401 }]);
    const client = new IngestClient({
      ingestUrl: "https://x/ingest",
      agentToken: "t",
      fetchImpl,
      onTokenRejected: () => {
        rejected = true;
      },
    });
    client.enqueue({ telemetry: { gpu_temp_c: 60 } });
    await client.flush();
    expect(rejected).toBe(true);
    expect(client.queueLength).toBe(1);
  });

  test("backs off after a failure instead of retrying on the very next flush", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    const client = new IngestClient({ ingestUrl: "https://x/ingest", agentToken: "t", fetchImpl });
    client.enqueue({ telemetry: { gpu_temp_c: 60 } });
    await client.flush();
    expect(calls).toBe(1);
    await client.flush();
    expect(calls).toBe(1);
  });
});
