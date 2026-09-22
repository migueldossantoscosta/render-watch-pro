import { createClient } from "npm:@supabase/supabase-js@2";

type IngestBody = {
  telemetry?: Record<string, number | null> | null;
  jobs?: Record<string, unknown>[];
  events?: { level: string; source: string | null; message: string }[];
};

const TELEMETRY_COLUMNS = [
  "cpu_temp_c",
  "cpu_load_pct",
  "gpu_temp_c",
  "gpu_load_pct",
  "gpu_fan_pct",
  "gpu_power_w",
  "vram_used_mb",
  "vram_total_mb",
  "ram_used_gb",
  "ram_total_gb",
  "power_draw_w",
] as const;

/** Only known columns survive; arbitrary client-supplied keys are dropped. */
function pickTelemetry(telemetry: Record<string, number | null>): Record<string, number | null> {
  const picked: Record<string, number | null> = {};
  for (const column of TELEMETRY_COLUMNS) {
    const value = telemetry[column];
    picked[column] = typeof value === "number" ? value : null;
  }
  return picked;
}

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

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

  const writeErrors: string[] = [];

  const { error: heartbeatError } = await supabase
    .from("devices")
    .update({ last_seen_at: new Date().toISOString(), online: true })
    .eq("id", deviceId);
  if (heartbeatError) writeErrors.push(`devices: ${heartbeatError.message}`);

  if (body.telemetry) {
    const { error: telemetryError } = await supabase
      .from("telemetry_samples")
      .insert({ ...pickTelemetry(body.telemetry), device_id: deviceId });
    if (telemetryError) writeErrors.push(`telemetry_samples: ${telemetryError.message}`);
  }

  if (body.jobs?.length) {
    const { error: jobsError } = await supabase.from("render_jobs").upsert(
      body.jobs.map((job) => ({
        ...job,
        device_id: deviceId,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "device_id,external_id" },
    );
    if (jobsError) writeErrors.push(`render_jobs: ${jobsError.message}`);
  }

  if (body.events?.length) {
    const { error: eventsError } = await supabase
      .from("device_events")
      .insert(body.events.map((event) => ({ ...event, device_id: deviceId })));
    if (eventsError) writeErrors.push(`device_events: ${eventsError.message}`);
  }

  if (writeErrors.length > 0) {
    return new Response(
      JSON.stringify({ error: "One or more writes failed", details: writeErrors }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
