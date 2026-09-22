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
    await supabase.from("telemetry_samples").insert({ ...body.telemetry, device_id: deviceId });
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
