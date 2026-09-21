import { ENGINES, type EngineId } from "./registry";

export type DetectedProcess = {
  engine: EngineId;
  pid: number;
  commandLine: string | null;
};

type RawProcess = { ProcessId: number; Name: string; CommandLine: string | null };

function psScript(names: string[]): string {
  const filter = names.map((n) => `Name='${n}'`).join(" or ");
  return `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`;
}

export function parseProcessListJson(json: string): RawProcess[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function matchEngine(processName: string): EngineId | null {
  const lower = processName.toLowerCase();
  for (const engine of ENGINES) {
    if (engine.processName.toLowerCase() === lower) return engine.id;
  }
  return null;
}

const FRAME_RANGE_RE = /-s\s+(\d+)\s+-e\s+(\d+)/i;

export function parseFrameRange(commandLine: string | null): { start: number; end: number } | null {
  if (!commandLine) return null;
  const match = FRAME_RANGE_RE.exec(commandLine);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

const PROJECT_FILE_RE = /-(?:b|project)\s+"?([^"\s][^"]*?\.(?:blend|aep))"?(?:\s|$)/i;

export function parseProjectFile(commandLine: string | null): string | null {
  if (!commandLine) return null;
  const match = PROJECT_FILE_RE.exec(commandLine);
  return match ? match[1] : null;
}

export async function detectRenderProcesses(): Promise<DetectedProcess[]> {
  const names = ENGINES.map((e) => e.processName);
  try {
    const proc = Bun.spawn(["powershell", "-NoProfile", "-Command", psScript(names)], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return [];
    return parseProcessListJson(output)
      .map((p) => {
        const engine = matchEngine(p.Name);
        return engine ? { engine, pid: p.ProcessId, commandLine: p.CommandLine } : null;
      })
      .filter((p): p is DetectedProcess => p !== null);
  } catch {
    return [];
  }
}
