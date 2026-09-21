# Render Watcher

Act as a Principal Full-Stack Engineer and System Architect specialized in high-performance desktop agents and real-time remote monitoring systems.

I want you to build "RenderWatch": a lightweight, secure remote monitoring platform and desktop tray agent for 3D artists, video editors, and game developers.

### PRODUCT OVERVIEW & VALUE PROPOSITION

When creators render heavy 3D scenes (Blender, Maya, C4D), export long video timelines (Premiere, After Effects, DaVinci Resolve), or compile lighting/shaders (Unreal Engine, Unity), their machines are locked for hours. Existing remote desktops (TeamViewer, RDP) are bandwidth-heavy, awkward on mobile, and lack hardware diagnostics. 

RenderWatch solves this by running a ultra-lightweight background daemon on the desktop PC that streams telemetry, frame progress, and temperature alerts to a sleek mobile/web dashboard with emergency control triggers.

---

### TECH STACK RECOMMENDATION

1. Desktop Agent (Local Client):

   - Language/Framework: Rust or Go (for minimal CPU/RAM footprint < 20MB RAM) OR Node.js/Tauri.

   - Process Telemetry: System CLI / OS API wrappers (e.g., `nvidia-smi` / OpenHardwareMonitor API for GPU/CPU temps; log file watchers for render engines).

2. Backend & Real-Time Sync:

   - Websockets / Server-Sent Events (SSE) via Node.js (Fastify) or Elixir Phoenix.

   - Authentication: JWT tokens with 2FA + Secure Device Pairing Key (QR Code scan).

3. Web/Mobile Frontend:

   - Framework: React (Next.js) or Vue 3 + Tailwind CSS.

   - State Management: Zustand or TanStack Query.

   - PWA Support: Push Notifications API for background mobile alerts (e.g., "Render Failed on Frame 412").

---

### CORE FEATURE ROADMAP (MVP TO PRODUCTION)

1. Desktop Host Daemon / Agent:

   - Auto-detect active software processes (`blender.exe`, `afterfx.exe`, `UnrealEditor.exe`, `ffmpeg.exe`).

   - Parse active log files (e.g., Blender stdout line parsing for frame completion and sample counts).

   - Read GPU Temperature, Fan Speed, Power Draw, and VRAM using `nvidia-smi` or OS hardware APIs.

   - Secure local command execution (Pause Process, Abort Process, System Shutdown, Sleep).

2. Web & Mobile Dashboard UI:

   - Dark theme developer dashboard with high-contrast accent colors (Neon Cyan, Amber, Emerald, Red).

   - Live Telemetry Widgets: Real-time GPU/CPU Temperature gauges, VRAM usage, and estimated energy cost.

   - Active Render Jobs List: Show project name, engine, percentage bar, current frame / total frames, elapsed time, and ETA.

   - Quick Actions: "Pause Render", "Cancel Task", "Shutdown Machine when finished".

   - Real-Time System Log Feed: Streaming timeline of notifications (Errors, Frame completions, Thermal warnings).

3. Push Alerts & Webhook System:

   - Web Push Notifications for critical triggers:

     - Render Completed Successfully.

     - Process Crash / Unexpected Error.

     - Thermal Warning (GPU > 85°C for more than 3 minutes).

   - Discord & Telegram Bot Webhook integrations for notifications.

---

### SECURITY & PRIVACY SPECIFICATIONS

- Local-First Privacy: NEVER stream full screen capture unless requested. Only metadata (frame count, percentages, logs) is sent over the wire.

- End-to-End Encryption (E2EE): Encrypted WebSocket tunnel between PC Agent and Dashboard.

- Remote Action Authorization: Destructive commands (e.g., Shutdown/Kill Process) require confirmation modal and local daemon token validation.

---

### TASK FOR YOU:

Please generate the initial repository structure, the desktop log parser module for Blender/After Effects, and the WebSocket server implementation to stream hardware stats every 1000ms.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/eceb74b2-6559-4619-a311-977e7bcc65e5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
