import si from "systeminformation";

export type SystemStats = {
  cpuLoadPct: number | null;
  cpuTempC: number | null;
  ramUsedGb: number | null;
  ramTotalGb: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function readSystemStats(): Promise<SystemStats> {
  const [load, temp, mem] = await Promise.all([
    si.currentLoad().catch(() => null),
    si.cpuTemperature().catch(() => null),
    si.mem().catch(() => null),
  ]);
  return {
    cpuLoadPct: load ? round1(load.currentLoad) : null,
    cpuTempC: temp && temp.main > 0 ? round1(temp.main) : null,
    ramUsedGb: mem ? round1(mem.active / 1024 ** 3) : null,
    ramTotalGb: mem ? round1(mem.total / 1024 ** 3) : null,
  };
}
