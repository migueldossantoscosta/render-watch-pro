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

`RENDERWATCH_PAIR_URL` is required — it points at the `pair` Supabase Edge
Function for your project, in the form
`https://<project-ref>.supabase.co/functions/v1/pair`. Without it the agent
falls back to a placeholder URL and pairing will fail.

```sh
bun install
RENDERWATCH_PAIR_URL="https://<project-ref>.supabase.co/functions/v1/pair" bun run start
```

On PowerShell:

```powershell
$env:RENDERWATCH_PAIR_URL = "https://<project-ref>.supabase.co/functions/v1/pair"
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
