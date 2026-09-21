# Desktop Agent + Telemetry Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the RenderWatch desktop agent (Bun/TypeScript) that detects Blender/After Effects renders, reads NVIDIA GPU + system telemetry, and streams it to Supabase every second via a new ingest Edge Function — plus the Machines page needed to pair a device, and a build-breaking bug fix in the existing dashboard.

**Architecture:** No custom WebSocket server. The agent POSTs a batched JSON payload to a Supabase Edge Function (`ingest`) once per second; the function validates the device's `agent_token` and writes with the service role. The existing dashboard already receives live updates via Supabase Realtime — no dashboard changes needed beyond the new Machines page and one bug fix.

**Tech Stack:** Bun (runtime + package manager + test runner) and TypeScript for the agent; Deno for the two Supabase Edge Functions (`pair`, `ingest`); the existing TanStack Start + React 19 + shadcn/ui stack for the Machines page.

Full design context: [`docs/superpowers/specs/2026-09-21-desktop-agent-telemetry-ingest-design.md`](../specs/2026-09-21-desktop-agent-telemetry-ingest-design.md).

## Global Constraints

- Package manager for the new `agent/` workspace is **bun** (the repo root already uses `bun.lock`/`bunfig.toml`; do not introduce npm/yarn/pnpm lockfiles).
- Code style matches the repo's `.prettierrc`: double quotes, semicolons, trailing commas, 100-column print width. TypeScript `strict: true` everywhere.
- Target platform for process/hardware detection is **Windows** (the artist machines this ships to, and the dev machine here run Windows 11) — use PowerShell/`Get-CimInstance` and `nvidia-smi`, not Linux-only tools.
- GPU telemetry is **NVIDIA-only** for this slice (approved in brainstorming) — no AMD/Intel code paths.
- No Docker or Deno is installed in this environment, so the two Supabase Edge Functions cannot be run locally. They are verified by (a) a TypeScript syntax/type check with `deno check` if available, otherwise a careful read, and (b) deployment to the real dev Supabase project — **deployment is a live-infrastructure change and requires explicit user confirmation before running**, per the safety rules governing this session.
- No new Supabase migrations: `devices` already grants `authenticated` users full CRUD via RLS (covers the Machines page); the agent's writes go through the service role inside the Edge Functions, bypassing RLS entirely, so `telemetry_samples`/`render_jobs`/`device_events` need no new INSERT policies.
- Reuse existing shadcn/ui primitives under `src/components/ui/` for the Machines page — don't add a new UI library.
- Secrets: never hardcode the Supabase service role key; Edge Functions read it from the ambient `SUPABASE_SERVICE_ROLE_KEY` env var Supabase injects automatically. `.env` is gitignored (fixed in a prior commit) — don't re-add tracked secrets.

---

## Task 1: Fix the build-breaking syntax bug in `dashboard.tsx`

**Files:**
- Modify: `src/routes/_authenticated/dashboard.tsx:57`

**Interfaces:** None — one-line fix, no new exports.

- [ ] **Step 1: Confirm the bug**

Run: `grep -n "component: Dashboard" src/routes/_authenticated/dashboard.tsx`
Expected: `57:  component: Dashboard;` (semicolon instead of comma — invalid object literal member).

- [ ] **Step 2: Fix it**

In `src/routes/_authenticated/dashboard.tsx`, change line 57 from:

```ts
  component: Dashboard;
});
```

to:

```ts
  component: Dashboard,
});
```

- [ ] **Step 3: Verify the project type-checks**

Run: `bun run lint`
Expected: no parse errors referencing `dashboard.tsx` (pre-existing unrelated lint warnings, if any, are out of scope).

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/dashboard.tsx
git commit -m "fix: correct object literal syntax in dashboard route definition"
```

---

## Task 2: Machines page (`/machines`)

**Files:**
- Create: `src/routes/_authenticated/machines.tsx`

**Interfaces:**
- Consumes: `supabase` client (`src/integrations/supabase/client.ts`), `Device` type and `isOnline()` from `src/lib/renderwatch.ts`, shadcn primitives `Button`, `Input`, `Label`, `Badge`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`/`DialogTrigger` from `src/components/ui/*`.
- Produces: the `/machines` route, satisfying the existing dead link in `src/components/renderwatch/AppShell.tsx`. No exports consumed by later tasks — the agent only needs the `pairing_code` value that already exists on the `devices` row.

This page has no dedicated automated test (it's a thin CRUD UI over an already-tested-by-RLS table, consistent with the rest of the dashboard, which also has none). It's verified manually in Task 16.

- [ ] **Step 1: Create the route file**

Create `src/routes/_authenticated/machines.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, MonitorSmartphone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { isOnline, type Device } from "@/lib/renderwatch";

export const Route = createFileRoute("/_authenticated/machines")({
  head: () => ({
    meta: [
      { title: "Machines — RenderWatch" },
      { name: "description", content: "Pair and manage your render machines." },
    ],
  }),
  component: Machines,
});

function Machines() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [os, setOs] = useState("");
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<Device | null>(null);

  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Device[];
    },
  });

  const devices = devicesQuery.data ?? [];

  async function createDevice() {
    if (!name.trim()) return;
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast.error("You need to be signed in.");
      setCreating(false);
      return;
    }
    const { data, error } = await supabase
      .from("devices")
      .insert({ name: name.trim(), os: os.trim() || null, user_id: userData.user.id })
      .select("*")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Could not create the machine.");
      return;
    }
    setJustCreated(data as Device);
    setName("");
    setOs("");
    queryClient.invalidateQueries({ queryKey: ["devices"] });
  }

  async function deleteDevice(device: Device) {
    const { error } = await supabase.from("devices").delete().eq("id", device.id);
    if (error) {
      toast.error("Could not remove the machine.");
      return;
    }
    toast.success(`${device.name} removed`);
    queryClient.invalidateQueries({ queryKey: ["devices"] });
  }

  function copyPairingCode(code: string) {
    navigator.clipboard.writeText(code);
    toast.success("Pairing code copied");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="mono text-xs tracking-widest text-muted-foreground uppercase">Machines</h1>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setJustCreated(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              Add machine
            </Button>
          </DialogTrigger>
          <DialogContent>
            {justCreated ? (
              <>
                <DialogHeader>
                  <DialogTitle>{justCreated.name} added</DialogTitle>
                  <DialogDescription>
                    Paste this pairing code into the RenderWatch agent on that machine the first
                    time it runs.
                  </DialogDescription>
                </DialogHeader>
                <div className="mono flex items-center justify-between rounded-md border border-border bg-secondary px-3 py-2 text-lg">
                  {justCreated.pairing_code}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyPairingCode(justCreated.pairing_code)}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setOpen(false);
                      setJustCreated(null);
                    }}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Add a machine</DialogTitle>
                  <DialogDescription>
                    Give it a name so you can recognize it on the dashboard.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="machine-name">Name</Label>
                    <Input
                      id="machine-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Render rig 1"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="machine-os">OS (optional)</Label>
                    <Input
                      id="machine-os"
                      value={os}
                      onChange={(e) => setOs(e.target.value)}
                      placeholder="Windows 11"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={createDevice} disabled={creating || !name.trim()}>
                    {creating ? "Creating…" : "Create"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {devicesQuery.isLoading ? (
        <p className="mono text-sm text-muted-foreground">Loading…</p>
      ) : devices.length === 0 ? (
        <div className="panel p-8 text-center">
          <MonitorSmartphone className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">No machines yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a machine to get a pairing code for the RenderWatch agent.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <div key={device.id} className="panel space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${
                    isOnline(device) ? "live-dot bg-success" : "bg-muted-foreground"
                  }`}
                />
                <p className="flex-1 truncate font-medium">{device.name}</p>
                <Badge variant={device.paired ? "outline" : "secondary"} className="mono">
                  {device.paired ? "paired" : "unpaired"}
                </Badge>
              </div>
              <p className="mono text-xs text-muted-foreground">{device.os ?? "unknown OS"}</p>
              {!device.paired && (
                <div className="mono flex items-center justify-between rounded-md border border-border bg-secondary px-2 py-1.5 text-sm">
                  {device.pairing_code}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyPairingCode(device.pairing_code)}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Button asChild size="sm" variant="secondary" className="flex-1">
                  <Link to="/dashboard">View</Link>
                </Button>
                <Button size="sm" variant="destructive" onClick={() => deleteDevice(device)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Let the router regenerate its route tree**

Run: `bun run dev` (start it, wait for the "ready" log line, then stop it with Ctrl+C — the TanStack Router Vite plugin regenerates `src/routeTree.gen.ts` on start)
Expected: `src/routeTree.gen.ts` now contains a `MachinesRoute` entry; no plugin errors printed.

- [ ] **Step 3: Type-check**

Run: `bun run lint`
Expected: no new errors from `machines.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/machines.tsx src/routeTree.gen.ts
git commit -m "feat: add Machines page for creating devices and viewing pairing codes"
```

---

## Task 3: Agent workspace scaffold

**Files:**
- Create: `agent/package.json`
- Create: `agent/tsconfig.json`
- Create: `agent/README.md`
- Create: `agent/src/` (empty dir, populated by later tasks)

**Interfaces:**
- Produces: a `bun test` and `bun run src/index.ts` entrypoint every later agent task relies on.

- [ ] **Step 1: Create the package manifest**

Create `agent/package.json`:

```json
{
  "name": "renderwatch-agent",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "systeminformation": "^5.23.5"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create the TypeScript config**

Create `agent/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create the README**

Create `agent/README.md`:

```markdown
# RenderWatch Agent

Background daemon that detects Blender/After Effects renders, reads NVIDIA GPU
and system telemetry, and streams it to the RenderWatch dashboard every
second.

## Requirements

- [Bun](https://bun.sh) installed on the render machine.
- Windows (process detection uses PowerShell/`Get-CimInstance`).
- NVIDIA GPU with `nvidia-smi` on PATH (optional — the agent runs fine
  without it, just without GPU telemetry).

## Setup

```sh
bun install
bun run start
```

On first run, the agent asks for the pairing code shown on the RenderWatch
dashboard's Machines page and saves the resulting credentials to
`~/.renderwatch/config.json`.

## Reporting render progress

The agent can only read render progress from a log file it knows about.
Add a `logPaths` entry to `~/.renderwatch/config.json` pointing at the log
each engine writes to:

```json
{
  "deviceId": "...",
  "agentToken": "...",
  "ingestUrl": "...",
  "logPaths": {
    "blender": "C:\\Users\\you\\renderwatch-logs\\blender.log",
    "after_effects": "C:\\Users\\you\\renderwatch-logs\\ae.log"
  }
}
```

- Blender: `blender -b scene.blend -s 1 -e 250 -a > C:\Users\you\renderwatch-logs\blender.log`
- After Effects: `aerender -project comp.aep -comp Main -logFile C:\Users\you\renderwatch-logs\ae.log`

Without a configured log path, the agent still reports that the process is
running, but frame/sample progress won't update.
```

- [ ] **Step 4: Install dependencies**

Run: `cd agent && bun install`
Expected: `bun.lock` created inside `agent/`, `node_modules/systeminformation` present, no supply-chain-guard rejection (if `bunfig.toml`'s 24h `minimumReleaseAge` guard blocks the resolved `systeminformation` version, bun prints which version/age was rejected — stop and ask the user before adding it to `minimumReleaseAgeExcludes`, per the guard's own comment in the root `bunfig.toml`).

- [ ] **Step 5: Verify the test runner works with zero tests**

Run: `cd agent && bun test`
Expected: `0 pass, 0 fail` (no test files exist yet — this just confirms the toolchain runs).

- [ ] **Step 6: Commit**

```bash
git add agent/package.json agent/tsconfig.json agent/README.md agent/bun.lock
git commit -m "feat: scaffold the renderwatch-agent Bun workspace"
```

---

## Task 4: Blender log parser

**Files:**
- Create: `agent/src/parsers/types.ts`
- Create: `agent/src/parsers/blender.ts`
- Test: `agent/src/parsers/blender.test.ts`

**Interfaces:**
- Produces: `ParsedProgress` type and `initialProgress(totalFrames)` from `types.ts`; `parseBlenderLogLines(lines: string[], previous: ParsedProgress): ParsedProgress` from `blender.ts`. Both are consumed by Task 5 (shares `types.ts`) and Task 13 (`loop.ts`).

- [ ] **Step 1: Write the failing tests**

Create `agent/src/parsers/types.ts`:

```ts
export type ParsedProgress = {
  currentFrame: number;
  totalFrames: number | null;
  samplesDone: number | null;
  samplesTotal: number | null;
  finished: boolean;
};

export function initialProgress(totalFrames: number | null = null): ParsedProgress {
  return { currentFrame: 0, totalFrames, samplesDone: null, samplesTotal: null, finished: false };
}
```

Create `agent/src/parsers/blender.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseBlenderLogLines } from "./blender";
import { initialProgress } from "./types";

describe("parseBlenderLogLines", () => {
  test("extracts frame and sample counts from Cycles output", () => {
    const lines = [
      "Fra:1 Mem:18.66M (Peak 18.66M) | Time:00:00.34 | Mem:0.00M, Peak:0.00M | Scene, ViewLayer | Sample 8/32",
      "Fra:1 Mem:18.66M (Peak 18.66M) | Time:00:00.68 | Mem:0.00M, Peak:0.00M | Scene, ViewLayer | Sample 32/32",
      "Saved: 'C:\\renders\\0001.png'",
    ];
    const result = parseBlenderLogLines(lines, initialProgress(1));
    expect(result.currentFrame).toBe(1);
    expect(result.samplesDone).toBe(32);
    expect(result.samplesTotal).toBe(32);
    expect(result.finished).toBe(true);
  });

  test("tracks frame number without samples for Eevee output", () => {
    const lines = [
      "Fra:5 Mem:22.10M (Peak 22.10M) | Time:00:01.02 | Scene, ViewLayer",
      "Saved: 'C:\\renders\\0005.png'",
    ];
    const result = parseBlenderLogLines(lines, initialProgress(10));
    expect(result.currentFrame).toBe(5);
    expect(result.samplesDone).toBeNull();
    expect(result.finished).toBe(false);
  });

  test("ignores unrelated log lines", () => {
    const result = parseBlenderLogLines(["Blender 4.2.0", "Read blend: file.blend"], initialProgress(10));
    expect(result.currentFrame).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd agent && bun test src/parsers/blender.test.ts`
Expected: FAIL — `Cannot find module './blender'` (the implementation doesn't exist yet).

- [ ] **Step 3: Implement the parser**

Create `agent/src/parsers/blender.ts`:

```ts
import type { ParsedProgress } from "./types";

const FRAME_RE = /^Fra:(\d+)/;
const SAMPLE_RE = /Sample (\d+)\/(\d+)/;

export function parseBlenderLogLines(lines: string[], previous: ParsedProgress): ParsedProgress {
  const next = { ...previous };
  for (const line of lines) {
    const frameMatch = FRAME_RE.exec(line);
    if (frameMatch) {
      next.currentFrame = Number(frameMatch[1]);
      const sampleMatch = SAMPLE_RE.exec(line);
      if (sampleMatch) {
        next.samplesDone = Number(sampleMatch[1]);
        next.samplesTotal = Number(sampleMatch[2]);
      } else {
        next.samplesDone = null;
        next.samplesTotal = null;
      }
    }
    if (/^Saved: /.test(line) && next.totalFrames != null && next.currentFrame >= next.totalFrames) {
      next.finished = true;
    }
  }
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd agent && bun test src/parsers/blender.test.ts`
Expected: `3 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add agent/src/parsers/types.ts agent/src/parsers/blender.ts agent/src/parsers/blender.test.ts
git commit -m "feat(agent): add Blender render log parser"
```

---

## Task 5: After Effects log parser

**Files:**
- Create: `agent/src/parsers/afterEffects.ts`
- Test: `agent/src/parsers/afterEffects.test.ts`

**Interfaces:**
- Consumes: `ParsedProgress`, `initialProgress` from `./types` (Task 4).
- Produces: `parseAfterEffectsLogLines(lines: string[], previous: ParsedProgress): ParsedProgress`, consumed by Task 13 (`loop.ts`).

**Note on accuracy:** this parser targets the documented `aerender -logType errorsAndProgress` line format (`PROGRESS:  <timecode> (<frame>): <n> Seconds`, ending with `PROGRESS:  Total Time Elapsed: ...`). It hasn't been validated against a real `aerender` log yet — Task 16's manual verification includes confirming this against real output and adjusting the regex/fixtures here if the format differs, per the design doc's documented limitation.

- [ ] **Step 1: Write the failing tests**

Create `agent/src/parsers/afterEffects.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseAfterEffectsLogLines } from "./afterEffects";
import { initialProgress } from "./types";

describe("parseAfterEffectsLogLines", () => {
  test("extracts the frame number from PROGRESS lines", () => {
    const lines = [
      "PROGRESS:  0:00:00:00 (0): 0 Seconds",
      "PROGRESS:  0:00:00:01 (1): 2 Seconds",
      "PROGRESS:  0:00:00:02 (2): 4 Seconds",
    ];
    const result = parseAfterEffectsLogLines(lines, initialProgress(250));
    expect(result.currentFrame).toBe(2);
    expect(result.finished).toBe(false);
  });

  test("marks the job finished on the total time elapsed summary line", () => {
    const lines = ["PROGRESS:  Total Time Elapsed: 0:03:12"];
    const result = parseAfterEffectsLogLines(lines, initialProgress(250));
    expect(result.finished).toBe(true);
  });

  test("ignores unrelated log lines", () => {
    const result = parseAfterEffectsLogLines(
      ["aerender.exe 24.0", "Starting composition..."],
      initialProgress(250),
    );
    expect(result.currentFrame).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd agent && bun test src/parsers/afterEffects.test.ts`
Expected: FAIL — `Cannot find module './afterEffects'`.

- [ ] **Step 3: Implement the parser**

Create `agent/src/parsers/afterEffects.ts`:

```ts
import type { ParsedProgress } from "./types";

const FRAME_RE = /^PROGRESS:\s+[\d:]+\s+\((\d+)\):/;
const FINISHED_RE = /^PROGRESS:\s+Total Time Elapsed/;

export function parseAfterEffectsLogLines(lines: string[], previous: ParsedProgress): ParsedProgress {
  const next = { ...previous };
  for (const line of lines) {
    const frameMatch = FRAME_RE.exec(line);
    if (frameMatch) {
      next.currentFrame = Number(frameMatch[1]);
    }
    if (FINISHED_RE.test(line)) {
      next.finished = true;
    }
  }
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd agent && bun test src/parsers/afterEffects.test.ts`
Expected: `3 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add agent/src/parsers/afterEffects.ts agent/src/parsers/afterEffects.test.ts
git commit -m "feat(agent): add After Effects render log parser"
```

---

## Task 6: NVIDIA GPU telemetry reader

**Files:**
- Create: `agent/src/telemetry/gpu.ts`
- Test: `agent/src/telemetry/gpu.test.ts`

**Interfaces:**
- Produces: `GpuStats` type, `emptyGpuStats()`, `parseNvidiaSmiOutput(output: string): GpuStats`, `readGpuStats(): Promise<GpuStats>` — consumed by Task 13 (`loop.ts`).

- [ ] **Step 1: Write the failing tests**

Create `agent/src/telemetry/gpu.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { emptyGpuStats, parseNvidiaSmiOutput } from "./gpu";

describe("parseNvidiaSmiOutput", () => {
  test("parses a well-formed nvidia-smi CSV line", () => {
    const result = parseNvidiaSmiOutput("62, 98, 71, 210.50, 8192, 24576\n");
    expect(result).toEqual({
      tempC: 62,
      loadPct: 98,
      fanPct: 71,
      powerW: 210.5,
      vramUsedMb: 8192,
      vramTotalMb: 24576,
    });
  });

  test("returns empty stats for blank output", () => {
    expect(parseNvidiaSmiOutput("")).toEqual(emptyGpuStats());
  });

  test("returns empty stats for a malformed line", () => {
    expect(parseNvidiaSmiOutput("not,enough,fields")).toEqual(emptyGpuStats());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd agent && bun test src/telemetry/gpu.test.ts`
Expected: FAIL — `Cannot find module './gpu'`.

- [ ] **Step 3: Implement the GPU reader**

Create `agent/src/telemetry/gpu.ts`:

```ts
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
  return { tempC: temp, loadPct: load, fanPct: fan, powerW: power, vramUsedMb: vramUsed, vramTotalMb: vramTotal };
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd agent && bun test src/telemetry/gpu.test.ts`
Expected: `3 pass, 0 fail`.

- [ ] **Step 5: Manually verify against real hardware (if an NVIDIA GPU is available)**

Run: `cd agent && bun -e "import('./src/telemetry/gpu.ts').then(m => m.readGpuStats()).then(console.log)"`
Expected: either real numbers (if `nvidia-smi` is installed and a supported GPU is present) or `emptyGpuStats()`'s all-null shape (if not) — either way, no thrown error.

- [ ] **Step 6: Commit**

```bash
git add agent/src/telemetry/gpu.ts agent/src/telemetry/gpu.test.ts
git commit -m "feat(agent): add nvidia-smi GPU telemetry reader"
```

---

## Task 7: CPU/RAM telemetry reader

**Files:**
- Create: `agent/src/telemetry/system.ts`

**Interfaces:**
- Produces: `SystemStats` type, `readSystemStats(): Promise<SystemStats>` — consumed by Task 13 (`loop.ts`).

No automated tests: this is a thin wrapper over the `systeminformation` library (already a well-tested third-party dependency); the design doc scopes automated tests to the parsers and the `nvidia-smi` CSV parser only. Verified manually in Step 2.

- [ ] **Step 1: Implement the system stats reader**

Create `agent/src/telemetry/system.ts`:

```ts
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
```

- [ ] **Step 2: Manually verify it returns plausible numbers**

Run: `cd agent && bun -e "import('./src/telemetry/system.ts').then(m => m.readSystemStats()).then(console.log)"`
Expected: an object with `cpuLoadPct` between 0-100, `ramTotalGb` roughly matching this machine's installed RAM, and no thrown error. If `si.cpuTemperature()` isn't supported on this machine, `cpuTempC` may legitimately be `null` — that's handled, not a bug.

- [ ] **Step 3: Commit**

```bash
git add agent/src/telemetry/system.ts
git commit -m "feat(agent): add CPU/RAM telemetry reader"
```

---

## Task 8: Process detection and command-line parsing

**Files:**
- Create: `agent/src/processes/registry.ts`
- Create: `agent/src/processes/detect.ts`
- Test: `agent/src/processes/detect.test.ts`

**Interfaces:**
- Produces: `EngineId` (`"blender" | "after_effects"`), `ENGINES` from `registry.ts`; `DetectedProcess` type, `detectRenderProcesses(): Promise<DetectedProcess[]>`, `parseProcessListJson`, `matchEngine`, `parseFrameRange`, `parseProjectFile` from `detect.ts`. All consumed by Task 13 (`loop.ts`).

- [ ] **Step 1: Write the failing tests**

Create `agent/src/processes/registry.ts`:

```ts
export type EngineId = "blender" | "after_effects";

export type EngineDefinition = {
  id: EngineId;
  processName: string;
};

export const ENGINES: EngineDefinition[] = [
  { id: "blender", processName: "blender.exe" },
  { id: "after_effects", processName: "aerender.exe" },
];
```

Create `agent/src/processes/detect.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { matchEngine, parseFrameRange, parseProcessListJson, parseProjectFile } from "./detect";

describe("parseProcessListJson", () => {
  test("parses a JSON array of processes", () => {
    const json = JSON.stringify([
      { ProcessId: 1234, Name: "blender.exe", CommandLine: "blender.exe -b scene.blend -a" },
    ]);
    expect(parseProcessListJson(json)).toEqual([
      { ProcessId: 1234, Name: "blender.exe", CommandLine: "blender.exe -b scene.blend -a" },
    ]);
  });

  test("wraps a single object result in an array", () => {
    const json = JSON.stringify({ ProcessId: 1, Name: "blender.exe", CommandLine: null });
    expect(parseProcessListJson(json)).toEqual([{ ProcessId: 1, Name: "blender.exe", CommandLine: null }]);
  });

  test("returns an empty array for blank output", () => {
    expect(parseProcessListJson("  ")).toEqual([]);
  });
});

describe("matchEngine", () => {
  test("matches a known process name case-insensitively", () => {
    expect(matchEngine("Blender.exe")).toBe("blender");
    expect(matchEngine("aerender.exe")).toBe("after_effects");
  });

  test("returns null for unknown processes", () => {
    expect(matchEngine("notepad.exe")).toBeNull();
  });
});

describe("parseFrameRange", () => {
  test("extracts explicit -s/-e frame bounds", () => {
    expect(parseFrameRange("blender.exe -b scene.blend -s 1 -e 250 -a")).toEqual({ start: 1, end: 250 });
  });

  test("returns null when no range flags are present", () => {
    expect(parseFrameRange("blender.exe -b scene.blend -a")).toBeNull();
  });

  test("returns null for a missing command line", () => {
    expect(parseFrameRange(null)).toBeNull();
  });
});

describe("parseProjectFile", () => {
  test("extracts the .blend path after -b", () => {
    expect(parseProjectFile('blender.exe -b "C:\\scenes\\shot01.blend" -a')).toBe("C:\\scenes\\shot01.blend");
  });

  test("extracts the .aep path after -project", () => {
    expect(parseProjectFile('aerender.exe -project "C:\\ae\\comp.aep" -comp Main')).toBe("C:\\ae\\comp.aep");
  });

  test("returns null when no project flag is present", () => {
    expect(parseProjectFile("blender.exe -a")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd agent && bun test src/processes/detect.test.ts`
Expected: FAIL — `Cannot find module './detect'`.

- [ ] **Step 3: Implement process detection**

Create `agent/src/processes/detect.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd agent && bun test src/processes/detect.test.ts`
Expected: `10 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add agent/src/processes/registry.ts agent/src/processes/detect.ts agent/src/processes/detect.test.ts
git commit -m "feat(agent): detect Blender/aerender processes via PowerShell"
```

---

## Task 9: Agent config file

**Files:**
- Create: `agent/src/config.ts`
- Test: `agent/src/config.test.ts`

**Interfaces:**
- Produces: `AgentConfig` type (`{ deviceId, agentToken, ingestUrl, logPaths? }`), `defaultConfigPath(): string`, `loadConfig(path): Promise<AgentConfig | null>`, `saveConfig(path, config): Promise<void>` — consumed by Task 10 (`pairing.ts`), Task 13 (`loop.ts`), Task 14 (`index.ts`).

- [ ] **Step 1: Write the failing tests**

Create `agent/src/config.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd agent && bun test src/config.test.ts`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Implement config load/save**

Create `agent/src/config.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { EngineId } from "./processes/registry";

export type AgentConfig = {
  deviceId: string;
  agentToken: string;
  ingestUrl: string;
  logPaths?: Partial<Record<EngineId, string>>;
};

export function defaultConfigPath(): string {
  return join(homedir(), ".renderwatch", "config.json");
}

export async function loadConfig(path: string): Promise<AgentConfig | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.deviceId === "string" &&
      typeof parsed.agentToken === "string" &&
      typeof parsed.ingestUrl === "string"
    ) {
      return parsed as AgentConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveConfig(path: string, config: AgentConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd agent && bun test src/config.test.ts`
Expected: `3 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add agent/src/config.ts agent/src/config.test.ts
git commit -m "feat(agent): add local config file load/save"
```

---

## Task 10: Pairing flow

**Files:**
- Create: `agent/src/pairing.ts`
- Test: `agent/src/pairing.test.ts`

**Interfaces:**
- Consumes: `AgentConfig`, `loadConfig`, `saveConfig` from `./config` (Task 9).
- Produces: `pairDevice(pairingCode, pairUrl, fetchImpl?): Promise<AgentConfig>`, `promptForPairingCode(): Promise<string>`, `ensurePaired(options): Promise<AgentConfig>` — consumed by Task 14 (`index.ts`).

- [ ] **Step 1: Write the failing tests**

Create `agent/src/pairing.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ensurePaired, pairDevice } from "./pairing";
import type { AgentConfig } from "./config";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;
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

  test("throws with the response status and body on failure", async () => {
    const fetchImpl = fakeFetch(404, "unknown pairing code");
    await expect(
      pairDevice("BAD", "https://example.com/functions/v1/pair", fetchImpl),
    ).rejects.toThrow("Pairing failed (404): unknown pairing code");
  });
});

describe("ensurePaired", () => {
  test("returns existing config without prompting", async () => {
    const existing: AgentConfig = { deviceId: "d1", agentToken: "t1", ingestUrl: "https://x/ingest" };
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
    let saved: AgentConfig | null = null;
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd agent && bun test src/pairing.test.ts`
Expected: FAIL — `Cannot find module './pairing'`.

- [ ] **Step 3: Implement pairing**

Create `agent/src/pairing.ts`:

```ts
import type { AgentConfig } from "./config";

export type PairResponse = { device_id: string; agent_token: string };

export async function pairDevice(
  pairingCode: string,
  pairUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentConfig> {
  const response = await fetchImpl(pairUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairing_code: pairingCode }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Pairing failed (${response.status}): ${body || response.statusText}`);
  }
  const data = (await response.json()) as PairResponse;
  return {
    deviceId: data.device_id,
    agentToken: data.agent_token,
    ingestUrl: pairUrl.replace(/\/pair$/, "/ingest"),
  };
}

export async function promptForPairingCode(): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Enter the pairing code shown on the RenderWatch dashboard: ");
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function ensurePaired(options: {
  configPath: string;
  pairUrl: string;
  loadConfig: (path: string) => Promise<AgentConfig | null>;
  saveConfig: (path: string, config: AgentConfig) => Promise<void>;
  promptForCode: () => Promise<string>;
  fetchImpl?: typeof fetch;
}): Promise<AgentConfig> {
  const existing = await options.loadConfig(options.configPath);
  if (existing) return existing;
  const code = await options.promptForCode();
  const config = await pairDevice(code, options.pairUrl, options.fetchImpl ?? fetch);
  await options.saveConfig(options.configPath, config);
  return config;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd agent && bun test src/pairing.test.ts`
Expected: `4 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add agent/src/pairing.ts agent/src/pairing.test.ts
git commit -m "feat(agent): add pairing-code exchange and first-run flow"
```

---

## Task 11: Log tailing utility

**Files:**
- Create: `agent/src/logs/tail.ts`
- Test: `agent/src/logs/tail.test.ts`

**Interfaces:**
- Produces: `TailState` type (`{ offset: number }`), `readNewLines(path, state): Promise<string[]>` — consumed by Task 13 (`loop.ts`).

- [ ] **Step 1: Write the failing tests**

Create `agent/src/logs/tail.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNewLines, type TailState } from "./tail";

describe("readNewLines", () => {
  test("returns only lines appended since the last read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "renderwatch-log-"));
    const path = join(dir, "render.log");
    try {
      await Bun.write(path, "line one\nline two\n");
      const state: TailState = { offset: 0 };
      const first = await readNewLines(path, state);
      expect(first).toEqual(["line one", "line two"]);

      await Bun.write(path, "line one\nline two\nline three\n");
      const second = await readNewLines(path, state);
      expect(second).toEqual(["line three"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("restarts from the beginning when the file shrinks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "renderwatch-log-"));
    const path = join(dir, "render.log");
    try {
      await Bun.write(path, "aaaaaaaaaa\n");
      const state: TailState = { offset: 0 };
      await readNewLines(path, state);

      await Bun.write(path, "new\n");
      const afterTruncate = await readNewLines(path, state);
      expect(afterTruncate).toEqual(["new"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns an empty array when the file does not exist", async () => {
    const state: TailState = { offset: 0 };
    expect(await readNewLines(join(tmpdir(), "does-not-exist.log"), state)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd agent && bun test src/logs/tail.test.ts`
Expected: FAIL — `Cannot find module './tail'`.

- [ ] **Step 3: Implement the tailer**

Create `agent/src/logs/tail.ts`:

```ts
import { open, stat } from "node:fs/promises";

export type TailState = { offset: number };

export async function readNewLines(path: string, state: TailState): Promise<string[]> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return [];
  }
  if (size < state.offset) {
    state.offset = 0;
  }
  if (size === state.offset) {
    return [];
  }
  const handle = await open(path, "r");
  try {
    const length = size - state.offset;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, state.offset);
    state.offset = size;
    return buffer
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
  } finally {
    await handle.close();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd agent && bun test src/logs/tail.test.ts`
Expected: `3 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add agent/src/logs/tail.ts agent/src/logs/tail.test.ts
git commit -m "feat(agent): add incremental log tailing with rotation handling"
```

---

## Task 12: Ingest client (batching, retry, backoff)

**Files:**
- Create: `agent/src/ingest/client.ts`
- Test: `agent/src/ingest/client.test.ts`

**Interfaces:**
- Produces: `IngestPayload` type (`{ telemetry?, jobs?, events? }`), `IngestClientOptions`, `IngestClient` class with `enqueue(payload)`, `queueLength`, `flush(): Promise<void>` — consumed by Task 13 (`loop.ts` produces `IngestPayload`) and Task 14 (`index.ts` owns the `IngestClient` instance).

- [ ] **Step 1: Write the failing tests**

Create `agent/src/ingest/client.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd agent && bun test src/ingest/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 3: Implement the ingest client**

Create `agent/src/ingest/client.ts`:

```ts
export type IngestPayload = {
  telemetry?: Record<string, number | null> | null;
  jobs?: Record<string, unknown>[];
  events?: { level: string; source: string | null; message: string }[];
};

export type IngestClientOptions = {
  ingestUrl: string;
  agentToken: string;
  fetchImpl?: typeof fetch;
  maxQueueSize?: number;
  onTokenRejected?: () => void;
  onDrop?: (payload: IngestPayload) => void;
};

export class IngestClient {
  private queue: IngestPayload[] = [];
  private readonly maxQueueSize: number;
  private readonly fetchImpl: typeof fetch;
  private consecutiveFailures = 0;
  private skipTicks = 0;

  constructor(private readonly options: IngestClientOptions) {
    this.maxQueueSize = options.maxQueueSize ?? 60;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  enqueue(payload: IngestPayload): void {
    this.queue.push(payload);
    if (this.queue.length > this.maxQueueSize) {
      const dropped = this.queue.shift();
      if (dropped) this.options.onDrop?.(dropped);
    }
  }

  get queueLength(): number {
    return this.queue.length;
  }

  async flush(): Promise<void> {
    if (this.skipTicks > 0) {
      this.skipTicks -= 1;
      return;
    }
    while (this.queue.length > 0) {
      const payload = this.queue[0];
      const ok = await this.send(payload);
      if (!ok) {
        this.registerFailure();
        return;
      }
      this.consecutiveFailures = 0;
      this.queue.shift();
    }
  }

  private registerFailure(): void {
    this.consecutiveFailures = Math.min(this.consecutiveFailures + 1, 6);
    this.skipTicks = 2 ** this.consecutiveFailures - 1;
  }

  private async send(payload: IngestPayload): Promise<boolean> {
    try {
      const response = await this.fetchImpl(this.options.ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.agentToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        this.options.onTokenRejected?.();
        return false;
      }
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd agent && bun test src/ingest/client.test.ts`
Expected: `5 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add agent/src/ingest/client.ts agent/src/ingest/client.test.ts
git commit -m "feat(agent): add ingest client with retry backoff and bounded queue"
```

---

## Task 13: Loop orchestration (`runTick`)

**Files:**
- Create: `agent/src/loop.ts`
- Test: `agent/src/loop.test.ts`

**Interfaces:**
- Consumes: `AgentConfig` (Task 9); `detectRenderProcesses`, `parseFrameRange`, `parseProjectFile`, `DetectedProcess`, `EngineId` (Task 8); `readNewLines`, `TailState` (Task 11); `parseBlenderLogLines` (Task 4); `parseAfterEffectsLogLines` (Task 5); `initialProgress`, `ParsedProgress` (Task 4); `readGpuStats` (Task 6); `readSystemStats` (Task 7); `IngestPayload` (Task 12).
- Produces: `LoopState` type, `createLoopState(): LoopState`, `runTick(config, state, deps?): Promise<IngestPayload>` — consumed by Task 14 (`index.ts`).

- [ ] **Step 1: Write the failing tests**

Create `agent/src/loop.test.ts`:

```ts
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
      readSystemStats: async () => ({ cpuLoadPct: null, cpuTempC: null, ramUsedGb: null, ramTotalGb: null }),
      readNewLines: async () => ["Fra:5 Mem:1M | Sample 16/32"],
    };
    const payload = await runTick({ ...config, logPaths: { blender: "C:\\logs\\blender.log" } }, state, deps);
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
    expect(payload.events).toEqual([{ level: "info", source: "blender", message: "Detected shot01.blend rendering" }]);
  });

  test("removes a job once its process is no longer detected", async () => {
    const state = createLoopState();
    const firstDeps = {
      detectRenderProcesses: async () => [
        { engine: "blender" as const, pid: 111, commandLine: 'blender.exe -b "shot01.blend" -a' },
      ],
      readGpuStats: async () => emptyGpuStats(),
      readSystemStats: async () => ({ cpuLoadPct: null, cpuTempC: null, ramUsedGb: null, ramTotalGb: null }),
      readNewLines: async () => [],
    };
    await runTick(config, state, firstDeps);
    expect(state.jobs.size).toBe(1);

    const secondDeps = { ...firstDeps, detectRenderProcesses: async () => [] };
    await runTick(config, state, secondDeps);
    expect(state.jobs.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd agent && bun test src/loop.test.ts`
Expected: FAIL — `Cannot find module './loop'`.

- [ ] **Step 3: Implement the loop**

Create `agent/src/loop.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd agent && bun test src/loop.test.ts`
Expected: `3 pass, 0 fail`.

- [ ] **Step 5: Run the full agent test suite**

Run: `cd agent && bun test`
Expected: all test files pass (parsers, telemetry/gpu, processes/detect, config, pairing, logs/tail, ingest/client, loop — no failures).

- [ ] **Step 6: Commit**

```bash
git add agent/src/loop.ts agent/src/loop.test.ts
git commit -m "feat(agent): wire detection, parsing, and telemetry into one tick"
```

---

## Task 14: Agent entrypoint

**Files:**
- Create: `agent/src/index.ts`

**Interfaces:**
- Consumes: `defaultConfigPath`, `loadConfig`, `saveConfig`, `AgentConfig` (Task 9); `ensurePaired`, `promptForPairingCode` (Task 10); `createLoopState`, `runTick` (Task 13); `IngestClient` (Task 12).
- Produces: the `bun run start` entrypoint — nothing else consumes this file.

No automated test — this is orchestration/process glue (reading env vars, `setInterval`, `console.log`/`process.exit`), which the design doc scopes to manual verification (Task 16), consistent with `runTick`, `IngestClient`, and `ensurePaired` already covering the testable logic individually.

- [ ] **Step 1: Implement the entrypoint**

Create `agent/src/index.ts`:

```ts
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
```

On a `401` from the ingest function, this deletes the local config and loops back into `runAgentSession`, which calls `ensurePaired` again — since the config file is now gone, that re-prompts for a pairing code instead of failing silently, matching the design doc's error-handling requirement.

- [ ] **Step 2: Verify it starts and prompts for pairing**

Run: `cd agent && RENDERWATCH_PAIR_URL=https://example.invalid/pair bun run start`
Expected: prints `Enter the pairing code shown on the RenderWatch dashboard:` and waits for input (confirms the process boots, loads config, and reaches the prompt without crashing). Press Ctrl+C to stop — full pairing against a real backend is covered in Task 16.

- [ ] **Step 3: Commit**

```bash
git add agent/src/index.ts
git commit -m "feat(agent): wire pairing, loop, and ingest into the main entrypoint"
```

---

## Task 15: Supabase Edge Functions (`pair`, `ingest`)

**Files:**
- Create: `supabase/functions/pair/index.ts`
- Create: `supabase/functions/ingest/index.ts`

**Interfaces:**
- Consumes (at runtime, not compile time — Deno, not Bun): `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, both injected automatically by the Supabase Edge Functions runtime.
- Produces: the two HTTP endpoints `agent/src/pairing.ts` (`pairDevice`) and `agent/src/ingest/client.ts` (`IngestClient`) call.

These run on Deno, not Bun, and this environment has neither Deno nor Docker installed, so they can't be executed or type-checked locally. **Deploying them changes live infrastructure on the user's Supabase project — do not run the deploy step without the user explicitly confirming in chat first**, even though the CLI commands themselves are given below.

- [ ] **Step 1: Write the `pair` function**

Create `supabase/functions/pair/index.ts`:

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: { pairing_code?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const pairingCode = body.pairing_code?.trim();
  if (!pairingCode) {
    return new Response(JSON.stringify({ error: "pairing_code is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data, error } = await supabase
    .from("devices")
    .update({ paired: true })
    .eq("pairing_code", pairingCode)
    .select("id, agent_token")
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: "Lookup failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!data) {
    return new Response(JSON.stringify({ error: "Unknown pairing code" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ device_id: data.id, agent_token: data.agent_token }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Write the `ingest` function**

Create `supabase/functions/ingest/index.ts`:

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

type IngestBody = {
  telemetry?: Record<string, number | null> | null;
  jobs?: Record<string, unknown>[];
  events?: { level: string; source: string | null; message: string }[];
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization") ?? "";
  const agentToken = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!agentToken) {
    return new Response(JSON.stringify({ error: "Missing agent token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("id")
    .eq("agent_token", agentToken)
    .maybeSingle();

  if (deviceError) {
    return new Response(JSON.stringify({ error: "Lookup failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!device) {
    return new Response(JSON.stringify({ error: "Unknown agent token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const deviceId = device.id;

  await supabase.from("devices").update({ last_seen_at: new Date().toISOString(), online: true }).eq("id", deviceId);

  if (body.telemetry) {
    await supabase.from("telemetry_samples").insert({ device_id: deviceId, ...body.telemetry });
  }

  if (body.jobs?.length) {
    await supabase
      .from("render_jobs")
      .upsert(
        body.jobs.map((job) => ({ ...job, device_id: deviceId, updated_at: new Date().toISOString() })),
        { onConflict: "device_id,external_id" },
      );
  }

  if (body.events?.length) {
    await supabase.from("device_events").insert(body.events.map((event) => ({ ...event, device_id: deviceId })));
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 3: Commit the function source (no deploy yet)**

```bash
git add supabase/functions/pair/index.ts supabase/functions/ingest/index.ts
git commit -m "feat: add pair and ingest Supabase Edge Functions"
```

- [ ] **Step 4: Stop and ask before deploying**

Before running anything below, confirm with the user in chat that deploying is okay — this reaches their live Supabase project. Once confirmed:

```bash
bun add -d supabase
bunx supabase login
bunx supabase link --project-ref aqndbjetjlijulttmywe
bunx supabase functions deploy pair
bunx supabase functions deploy ingest
```

Expected: both commands print a deployed function URL under `https://aqndbjetjlijulttmywe.functions.supabase.co/`. Record the `ingest` URL's base (everything up to `/pair` or `/ingest`) — Task 16 needs it for `RENDERWATCH_PAIR_URL`.

---

## Task 16: End-to-end manual verification

**Files:** none — this task only runs and observes the system built in Tasks 1-15.

**Interfaces:** none.

- [ ] **Step 1: Start the dashboard**

Run: `bun run dev`
Expected: dev server starts without errors (Task 1's fix means `/dashboard` no longer breaks the build).

- [ ] **Step 2: Create a machine**

In the browser, sign in, go to `/machines`, click "Add machine", name it, and confirm the pairing-code dialog shows a code.
Expected: the new device appears in the list, badge reads "unpaired".

- [ ] **Step 3: Set up a log-producing render**

Render a small Blender scene from the command line with logging enabled, e.g.:

```bash
blender -b test.blend -s 1 -e 5 -a > C:\Users\<you>\renderwatch-logs\blender.log
```

Before running it, add a `logPaths.blender` entry pointing at that path to `~/.renderwatch/config.json` (create the file with the pairing-derived fields first via Step 4 below, then add `logPaths`).

- [ ] **Step 4: Pair and start the agent**

```bash
cd agent
RENDERWATCH_PAIR_URL=<ingest-function-base-from-task-15>/pair bun run start
```

Paste the pairing code from Step 2 when prompted.
Expected: agent prints "RenderWatch agent started." and stops erroring after the first tick.

- [ ] **Step 5: Confirm live data reaches the dashboard**

While the Blender render from Step 3 runs and the agent is running, watch `/dashboard` in the browser.
Expected: the device badge flips to "streaming", GPU/CPU telemetry gauges populate (or show "—" gracefully if no NVIDIA GPU is present), and a render job card appears showing increasing frame progress without a page refresh (Realtime push).

- [ ] **Step 6: Validate the After Effects parser against real output, if available**

If `aerender` is available, run a short render with `-logFile` and compare a few real log lines against the `PROGRESS:` format assumed in `agent/src/parsers/afterEffects.ts` (Task 5). If the real format differs, update the regexes and the fixtures in `agent/src/parsers/afterEffects.test.ts` to match, then re-run `bun test src/parsers/afterEffects.test.ts`.

- [ ] **Step 7: Record the outcome**

If everything in Steps 1-6 matches expectations, the slice is done. If something didn't (e.g., a hardware sensor field returns unexpected units, or the AE log format needed adjusting), note the fix inline in the relevant task's file and commit it separately — don't leave the plan's code silently out of sync with reality.
