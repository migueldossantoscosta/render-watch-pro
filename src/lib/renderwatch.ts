export type Device = {
  id: string;
  user_id: string;
  name: string;
  os: string | null;
  agent_version: string | null;
  agent_token: string;
  pairing_code: string;
  paired: boolean;
  online: boolean;
  shutdown_when_finished: boolean;
  thermal_limit_c: number;
  last_seen_at: string | null;
  created_at: string;
};

export type Telemetry = {
  id: number;
  device_id: string;
  cpu_temp_c: number | null;
  cpu_load_pct: number | null;
  gpu_temp_c: number | null;
  gpu_load_pct: number | null;
  gpu_fan_pct: number | null;
  gpu_power_w: number | null;
  vram_used_mb: number | null;
  vram_total_mb: number | null;
  ram_used_gb: number | null;
  ram_total_gb: number | null;
  power_draw_w: number | null;
  created_at: string;
};

export type RenderJob = {
  id: string;
  device_id: string;
  external_id: string | null;
  project_name: string;
  engine: string;
  status: string;
  current_frame: number;
  total_frames: number | null;
  samples_done: number | null;
  samples_total: number | null;
  progress: number;
  eta_seconds: number | null;
  started_at: string;
  updated_at: string;
};

export type DeviceEvent = {
  id: number;
  device_id: string;
  level: string;
  source: string | null;
  message: string;
  created_at: string;
};

/** Average residential price per kWh used for the running energy cost estimate. */
export const ENERGY_PRICE_PER_KWH = 0.28;

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function elapsedSeconds(from: string) {
  return Math.max(0, (Date.now() - new Date(from).getTime()) / 1000);
}

export function isOnline(device: Pick<Device, "last_seen_at">) {
  if (!device.last_seen_at) return false;
  return Date.now() - new Date(device.last_seen_at).getTime() < 15_000;
}
