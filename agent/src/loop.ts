import type { AgentConfig } from "./config";
import { detectRenderProcesses, parseFrameRange, parseProjectFile } from "./processes/detect";
import type { EngineId } from "./processes/registry";
import { readNewLines, type TailState } from "./logs/tail";
import { parseBlenderLogLines } from "./parsers/blender";
import { parseAfterEffectsLogLines } from "./parsers/afterEffects";
import { initialProgress, type ParsedProgress } from "./parsers/types";
import { readGpuStats } from "./telemetry/gpu";
import { readSystemStats } from "./telemetry/system";
import type { IngestPayload } from "./ingest/client";

export type JobState = {
  externalId: string;
  engine: EngineId;
  projectName: string;
  totalFrames: number | null;
  progress: ParsedProgress;
  tail: TailState;
};

export type LoopState = {
  jobs: Map<string, JobState>;
};

export function createLoopState(): LoopState {
  return { jobs: new Map() };
}

const PARSERS: Record<EngineId, (lines: string[], previous: ParsedProgress) => ParsedProgress> = {
  blender: parseBlenderLogLines,
  after_effects: parseAfterEffectsLogLines,
};

function jobKey(engine: EngineId, projectFile: string): string {
  return `${engine}:${projectFile}`;
}

export async function runTick(
  config: AgentConfig,
  state: LoopState,
  deps: {
    detectRenderProcesses: typeof detectRenderProcesses;
    readGpuStats: typeof readGpuStats;
    readSystemStats: typeof readSystemStats;
    readNewLines: typeof readNewLines;
  } = { detectRenderProcesses, readGpuStats, readSystemStats, readNewLines },
): Promise<IngestPayload> {
  const [gpu, system, processes] = await Promise.all([
    deps.readGpuStats(),
    deps.readSystemStats(),
    deps.detectRenderProcesses(),
  ]);

  const events: NonNullable<IngestPayload["events"]> = [];
  const jobs: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const proc of processes) {
    const projectFile = parseProjectFile(proc.commandLine) ?? `pid-${proc.pid}`;
    const key = jobKey(proc.engine, projectFile);
    seen.add(key);
    let job = state.jobs.get(key);
    if (!job) {
      const range = parseFrameRange(proc.commandLine);
      const totalFrames = range ? range.end - range.start + 1 : null;
      job = {
        externalId: key,
        engine: proc.engine,
        projectName: projectFile.split(/[\\/]/).pop() ?? projectFile,
        totalFrames,
        progress: initialProgress(totalFrames),
        tail: { offset: 0 },
      };
      state.jobs.set(key, job);
      events.push({ level: "info", source: proc.engine, message: `Detected ${job.projectName} rendering` });
    }

    const logPath = config.logPaths?.[proc.engine];
    if (logPath) {
      const lines = await deps.readNewLines(logPath, job.tail);
      if (lines.length > 0) {
        job.progress = PARSERS[proc.engine](lines, job.progress);
      }
    }

    const pct =
      job.totalFrames && job.totalFrames > 0
        ? Math.max(0, Math.min(100, (job.progress.currentFrame / job.totalFrames) * 100))
        : 0;

    jobs.push({
      external_id: job.externalId,
      project_name: job.projectName,
      engine: job.engine,
      status: job.progress.finished ? "completed" : "running",
      current_frame: job.progress.currentFrame,
      total_frames: job.totalFrames,
      samples_done: job.progress.samplesDone,
      samples_total: job.progress.samplesTotal,
      progress: pct,
    });

    if (job.progress.finished) {
      events.push({ level: "info", source: job.engine, message: `${job.projectName} finished rendering` });
      state.jobs.delete(key);
    }
  }

  for (const key of state.jobs.keys()) {
    if (!seen.has(key)) state.jobs.delete(key);
  }

  return {
    telemetry: {
      gpu_temp_c: gpu.tempC,
      gpu_load_pct: gpu.loadPct,
      gpu_fan_pct: gpu.fanPct,
      gpu_power_w: gpu.powerW,
      vram_used_mb: gpu.vramUsedMb,
      vram_total_mb: gpu.vramTotalMb,
      cpu_temp_c: system.cpuTempC,
      cpu_load_pct: system.cpuLoadPct,
      ram_used_gb: system.ramUsedGb,
      ram_total_gb: system.ramTotalGb,
      power_draw_w: gpu.powerW,
    },
    jobs,
    events,
  };
}
