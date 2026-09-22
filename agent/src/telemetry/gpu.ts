export type GpuStats = {
  tempC: number | null;
  loadPct: number | null;
  fanPct: number | null;
  powerW: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
};

const NVIDIA_SMI_ARGS = [
  "--query-gpu=temperature.gpu,utilization.gpu,fan.speed,power.draw,memory.used,memory.total",
  "--format=csv,noheader,nounits",
];

export function emptyGpuStats(): GpuStats {
  return {
    tempC: null,
    loadPct: null,
    fanPct: null,
    powerW: null,
    vramUsedMb: null,
    vramTotalMb: null,
  };
}

function toNumberOrNull(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseNvidiaSmiOutput(output: string): GpuStats {
  const firstLine = output.trim().split("\n")[0];
  if (!firstLine) return emptyGpuStats();
  const parts = firstLine.split(",").map((p) => p.trim());
  if (parts.length < 6) return emptyGpuStats();
  const [temp, load, fan, power, vramUsed, vramTotal] = parts.map(toNumberOrNull);
  return {
    tempC: temp,
    loadPct: load,
    fanPct: fan,
    powerW: power,
    vramUsedMb: vramUsed,
    vramTotalMb: vramTotal,
  };
}

export async function readGpuStats(): Promise<GpuStats> {
  try {
    const proc = Bun.spawn(["nvidia-smi", ...NVIDIA_SMI_ARGS], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return emptyGpuStats();
    return parseNvidiaSmiOutput(output);
  } catch {
    return emptyGpuStats();
  }
}
