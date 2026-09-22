import { describe, expect, test } from "bun:test";
import { createLoopState, runTick } from "./loop";
import { emptyGpuStats } from "./telemetry/gpu";
import type { AgentConfig } from "./config";

const config: AgentConfig = { deviceId: "d1", agentToken: "t1", ingestUrl: "https://x/ingest" };

describe("runTick", () => {
  test("reports telemetry with no jobs when nothing is detected", async () => {
    const state = createLoopState();
    const payload = await runTick(config, state, {
      detectRenderProcesses: async () => [],
      readGpuStats: async () => ({ ...emptyGpuStats(), tempC: 55 }),
      readSystemStats: async () => ({ cpuLoadPct: 10, cpuTempC: 40, ramUsedGb: 8, ramTotalGb: 32 }),
      readNewLines: async () => [],
    });
    expect(payload.telemetry?.gpu_temp_c).toBe(55);
    expect(payload.jobs).toEqual([]);
  });

  test("creates a job on first detection and updates progress from new log lines", async () => {
    const state = createLoopState();
    const deps = {
      detectRenderProcesses: async () => [
        {
          engine: "blender" as const,
          pid: 111,
          commandLine: 'blender.exe -b "C:\\scenes\\shot01.blend" -s 1 -e 10 -a',
        },
      ],
      readGpuStats: async () => emptyGpuStats(),
      readSystemStats: async () => ({
        cpuLoadPct: null,
        cpuTempC: null,
        ramUsedGb: null,
        ramTotalGb: null,
      }),
      readNewLines: async () => ["Fra:5 Mem:1M | Sample 16/32"],
    };
    const payload = await runTick(
      { ...config, logPaths: { blender: "C:\\logs\\blender.log" } },
      state,
      deps,
    );
    expect(payload.jobs).toEqual([
      {
        external_id: "blender:C:\\scenes\\shot01.blend",
        project_name: "shot01.blend",
        engine: "blender",
        status: "running",
        current_frame: 5,
        total_frames: 10,
        samples_done: 16,
        samples_total: 32,
        progress: 50,
      },
    ]);
    expect(payload.events).toEqual([
      { level: "info", source: "blender", message: "Detected shot01.blend rendering" },
    ]);
  });

  test("removes a job once its process is no longer detected", async () => {
    const state = createLoopState();
    const firstDeps = {
      detectRenderProcesses: async () => [
        { engine: "blender" as const, pid: 111, commandLine: 'blender.exe -b "shot01.blend" -a' },
      ],
      readGpuStats: async () => emptyGpuStats(),
      readSystemStats: async () => ({
        cpuLoadPct: null,
        cpuTempC: null,
        ramUsedGb: null,
        ramTotalGb: null,
      }),
      readNewLines: async () => [],
    };
    await runTick(config, state, firstDeps);
    expect(state.jobs.size).toBe(1);

    const secondDeps = { ...firstDeps, detectRenderProcesses: async () => [] };
    await runTick(config, state, secondDeps);
    expect(state.jobs.size).toBe(0);
  });

  test("emits the finished event once and keeps the job while the process lingers", async () => {
    const state = createLoopState();
    let tailCalls = 0;
    const deps = {
      detectRenderProcesses: async () => [
        {
          engine: "blender" as const,
          pid: 222,
          commandLine: 'blender.exe -b "C:\\scenes\\shot02.blend" -s 1 -e 3 -a',
        },
      ],
      readGpuStats: async () => emptyGpuStats(),
      readSystemStats: async () => ({
        cpuLoadPct: null,
        cpuTempC: null,
        ramUsedGb: null,
        ramTotalGb: null,
      }),
      readNewLines: async () => {
        tailCalls += 1;
        return ["Fra:3 Mem:1M | Sample 32/32", "Saved: 'C:\\out\\0003.png'"];
      },
    };
    const tickConfig = { ...config, logPaths: { blender: "C:\\logs\\blender.log" } };

    const first = await runTick(tickConfig, state, deps);
    const second = await runTick(tickConfig, state, deps);
    const third = await runTick(tickConfig, state, deps);

    const finishedMessage = "shot02.blend finished rendering";
    expect(first.events?.map((e) => e.message)).toContain(finishedMessage);
    expect(second.events?.map((e) => e.message) ?? []).not.toContain(finishedMessage);
    expect(third.events?.map((e) => e.message) ?? []).not.toContain(finishedMessage);
    expect(second.events).toEqual([]);
    expect(third.events).toEqual([]);

    expect(state.jobs.size).toBe(1);
    expect(tailCalls).toBe(1);
    for (const payload of [first, second, third]) {
      expect(payload.jobs?.length).toBe(1);
      expect(payload.jobs?.[0]?.status).toBe("completed");
    }
  });

  test("ignores an interactive Blender session with no background flag", async () => {
    const state = createLoopState();
    const payload = await runTick(config, state, {
      detectRenderProcesses: async () => [
        { engine: "blender" as const, pid: 333, commandLine: "blender.exe" },
      ],
      readGpuStats: async () => emptyGpuStats(),
      readSystemStats: async () => ({
        cpuLoadPct: null,
        cpuTempC: null,
        ramUsedGb: null,
        ramTotalGb: null,
      }),
      readNewLines: async () => [],
    });
    expect(payload.jobs).toEqual([]);
    expect(payload.events).toEqual([]);
    expect(state.jobs.size).toBe(0);
  });
});
