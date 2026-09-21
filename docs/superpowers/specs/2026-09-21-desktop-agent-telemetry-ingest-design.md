# RenderWatch — Desktop Agent + Telemetry Ingest (Design)

## Context

RenderWatch started as a Lovable-generated project: a TanStack Start (React 19) web
dashboard backed by Supabase (Postgres + Auth + Realtime). The Supabase schema
already defines `devices`, `telemetry_samples`, `render_jobs`, `device_events`,
`device_commands`, and `notification_channels`, all with RLS and Realtime enabled,
and `src/routes/_authenticated/dashboard.tsx` already reads these tables and
subscribes to `postgres_changes` for live updates.

What does not exist yet is the desktop agent itself: nothing detects render
software, reads hardware sensors, or writes telemetry into Supabase. This design
covers the first slice of that agent — the minimum needed to see real render
progress and hardware stats show up live on the existing dashboard.

Out of scope for this slice (planned as later, separate designs): remote command
execution (pause/abort/shutdown/sleep) even though `device_commands` already
exists, push notifications, Discord/Telegram webhooks, the "Alerts" dashboard
page, and publishing the repo to GitHub.

**Update:** the pairing flow below assumes a user can create a device row and
see its `pairing_code` from the dashboard. That page does not exist yet — only
`/dashboard` is implemented; `/machines` and `/alerts` are dead links in
`AppShell.tsx`'s nav. Since pairing has no other entry point, a minimal
**Machines** page is now in scope for this slice (see "Machines page" below).
Also in scope: fixing a syntax bug in `dashboard.tsx` (`component: Dashboard;`
uses a semicolon instead of a comma in an object literal, which breaks the
build) — unrelated to the agent work but blocking, so fixed alongside it.

## Architecture

No custom WebSocket server is built. The dashboard already receives live updates
via Supabase Realtime (which is WebSocket-based internally), so the agent only
needs to get rows into Postgres. It does that over plain HTTPS, once per second,
against a Supabase Edge Function that acts as the ingest boundary:

```
Blender/After Effects (process + log file) ─┐
                                              ├─> Agent (Node, 1s loop) ──HTTPS──> Edge Function "ingest" ──service role──> Postgres
nvidia-smi (GPU stats)  ─────────────────────┘                                           │
                                                                                   Postgres Realtime (already wired)
                                                                                           │
                                                                                           v
                                                                                  Dashboard (already implemented)
```

The agent authenticates to the Edge Function with the device's `agent_token`
(a bearer token, not a Supabase user session). RLS on `telemetry_samples` /
`render_jobs` / `device_events` currently only grants `SELECT` to the
`authenticated` role — there is no `INSERT` policy, so the agent cannot write
directly with `anon`/`authenticated` credentials. The Edge Function runs with
the Supabase **service role** key server-side, validates the `agent_token`
against `devices`, and only then writes on the agent's behalf. The service role
key never leaves the Edge Function.

## Repository layout

Monorepo: the agent lives in a new top-level `agent/` folder next to `src/` and
`supabase/`.

```
agent/
  package.json
  tsconfig.json
  src/
    index.ts                 # entrypoint: load config, run pairing if needed, start loop
    config.ts                # read/write ~/.renderwatch/config.json
    pairing.ts                # first-run: exchange pairing_code for device_id + agent_token
    logger.ts                 # local console/file logger
    telemetry/
      gpu.ts                   # nvidia-smi wrapper + CSV parser
      system.ts                # CPU load/temp, RAM via `systeminformation`
    processes/
      detect.ts                 # list running processes, match against known engines
      registry.ts                # engine name -> process name + log-parser mapping
    parsers/
      types.ts                   # ParsedProgress shape
      blender.ts                  # tail + regex parse for Blender console/log output
      afterEffects.ts             # tail + regex parse for aerender -logFile output
      index.ts                    # dispatch parser by engine
    ingest/
      client.ts                    # batches telemetry+jobs+events, POSTs every 1000ms
  README.md

supabase/functions/
  pair/index.ts                # exchange pairing_code -> { device_id, agent_token }
  ingest/index.ts               # validate agent_token, write rows via service role

src/routes/_authenticated/
  machines.tsx                  # new: list/create devices, show pairing_code
```

## Machines page (dashboard)

Minimal page at `/machines`, reusing the existing `devices` table (no schema
change needed):

- List existing devices (name, OS, online/offline dot via `isOnline()` from
  `src/lib/renderwatch.ts`, last seen), each linking to `/dashboard` filtered
  to that device.
- "Add machine" dialog: user enters a name (and optionally OS), inserts a row
  into `devices` via the Supabase client (same pattern already used in
  `dashboard.tsx` for `device_commands`/`devices` writes — RLS already allows
  `authenticated` users to `INSERT`/`UPDATE`/`DELETE` their own `devices` rows).
  On success, shows the generated `pairing_code` in the dialog with a copy
  button and the instruction to paste it into the agent on first run.
  `paired`/`agent_token` stay server-generated defaults; the row starts
  `paired = false` until the agent completes pairing via the `pair` Edge
  Function, at which point `paired` flips to `true` (handled by that function,
  not the page).
- Delete/remove a device (RLS already permits `DELETE` on own `devices`).

No new Supabase policies or tables required — `devices` already grants
`authenticated` users full CRUD on their own rows via RLS.

## Components

- **`agent/src/config.ts`** — reads/writes `~/.renderwatch/config.json`
  (`{ deviceId, agentToken, ingestUrl }`). File permissions restricted to the
  current user where the OS supports it.
- **`agent/src/pairing.ts`** — on first run (no config file), prompts for the
  `pairing_code` shown on the dashboard when a machine is created, calls the
  `pair` Edge Function, and persists the returned `device_id`/`agent_token`.
- **`agent/src/telemetry/gpu.ts`** — runs
  `nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,fan.speed,power.draw,memory.used,memory.total --format=csv,noheader,nounits`
  and parses the CSV line into
  `{ tempC, loadPct, fanPct, powerW, vramUsedMb, vramTotalMb }`. NVIDIA only for
  this slice. If the binary is missing or exits non-zero, all fields resolve to
  `null` and a warning is logged once (not every loop tick) — the agent keeps
  running with degraded telemetry rather than crashing.
- **`agent/src/telemetry/system.ts`** — CPU load/temperature and RAM usage via
  the `systeminformation` package.
- **`agent/src/processes/detect.ts`** — Windows-first: shells out to `tasklist`
  and checks for `blender.exe` / `afterfx.exe` (extensible via
  `processes/registry.ts` for future engines).
- **`agent/src/parsers/blender.ts`** — tails a configured Blender render log and
  extracts progress from lines Blender's command-line renderer emits, e.g.:
  - `Fra:12 Mem:18.66M (Peak 18.66M) | Time:00:12.34 | Mem:0.00M, Peak:0.00M | Scene, ViewLayer | Sample 16/32`
    → current frame `12`, `samplesDone=16`, `samplesTotal=32`.
  - `Saved: 'C:\...\0012.png'` → confirms frame `12` finished, used to
    increment `currentFrame` when no explicit sample counter is present
    (e.g. Eevee).
  - Total frame count comes from the job's configured `total_frames` (set when
    the render job row is created) rather than parsed from the log, since
    Blender's console output does not state it directly.
- **`agent/src/parsers/afterEffects.ts`** — tails the log file produced by
  `aerender -logFile <path>` and extracts progress from lines such as
  `PROGRESS:  Rendering Frame 240 (25 percent)`. The exact line format will be
  confirmed against real `aerender` output during implementation and the regex
  adjusted if needed; the parser is written against a small set of test
  fixtures so that adjustment is a fixture + regex change, not a redesign.
- **`agent/src/ingest/client.ts`** — every 1000ms, gathers the latest GPU/CPU/RAM
  reading, any detected job state changes, and any new log-derived events, and
  POSTs one batched JSON payload
  `{ telemetry, jobs: RenderJobUpdate[], events: DeviceEvent[] }` to the
  ingest Edge Function with `Authorization: Bearer <agentToken>`.
- **`supabase/functions/pair/index.ts`** — looks up `devices` by
  `pairing_code`, marks it `paired = true`, returns `{ device_id, agent_token }`.
- **`supabase/functions/ingest/index.ts`** — looks up the device by
  `agent_token` (service role, bypasses RLS), rejects with `401` if not found,
  otherwise inserts the telemetry sample, upserts the render job(s) by
  `(device_id, external_id)`, inserts new events, and updates
  `devices.last_seen_at = now()` / `devices.online = true`.

## Known limitation (by design, not hidden)

The agent can only report render progress when the render is producing a log
file it knows about: Blender via `blender -b file.blend -a > log.txt` (or an
explicitly configured log path), After Effects via `aerender ... -logFile path`.
A render started manually from each application's GUI without logging enabled
is not detected in this slice. Teaching the agent to launch the render itself
(and capture stdout directly, removing the log-file dependency) is a reasonable
follow-up but is not part of this design.

## Data flow

1. **Pairing (first run only):** user creates the machine in the dashboard
   (already generates `pairing_code`) → pastes the code when the agent prompts
   for it → agent calls `pair`, stores `device_id` + `agent_token` locally.
2. **Main loop (every 1000ms):** read GPU/CPU/RAM → detect target processes →
   for each configured log path, read any new lines and update the in-memory
   job state → POST the batched payload to `ingest`.
3. **`ingest` Edge Function:** validates the token, writes rows with the
   service role, updates device presence.
4. **Realtime (already implemented):** Postgres change events push to any
   dashboard subscribed to that device, no additional work needed.

## Error handling

- `nvidia-smi` missing or failing → GPU fields `null`, one warning logged, loop
  continues.
- Log file rotated/truncated → agent tracks the last-read byte offset per file;
  if the file is now shorter than that offset, it reopens from the start.
- Network/ingest failure → payloads queue in an in-memory ring buffer (capped
  at 60 entries, ~1 minute), retried with exponential backoff; once full, the
  oldest entry is dropped and the drop is logged locally.
- `agent_token` rejected with `401` → loop stops and the agent re-enters the
  pairing flow rather than continuing to fail silently.

## Testing

- Unit tests for `parsers/blender.ts` and `parsers/afterEffects.ts` against
  fixture log excerpts, asserting the extracted frame/sample/percentage values.
- Unit test for the `nvidia-smi` CSV parser against sample output strings,
  including the "binary not found" path.
- Manual/integration check: run the agent against a development Supabase
  project, confirm rows land in `telemetry_samples`/`render_jobs`/
  `device_events`, and confirm the existing dashboard updates live without any
  dashboard-side changes.
