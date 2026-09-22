import { createClient } from "npm:@supabase/supabase-js@2";

/** Same 8-character uppercase-hex shape as the devices.pairing_code DB default. */
function generatePairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("devices")
    // Rotate the code so the one just used cannot be replayed; the dashboard
    // always shows the current code for re-pairing after a token rejection.
    .update({ paired: true, pairing_code: generatePairingCode() })
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
