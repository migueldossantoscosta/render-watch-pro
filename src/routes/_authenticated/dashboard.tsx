import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cpu, Flame, HardDrive, Moon, Power, Thermometer, Zap } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TelemetryGauge } from "@/components/renderwatch/TelemetryGauge";
import { JobCard } from "@/components/renderwatch/JobCard";
import { EventFeed } from "@/components/renderwatch/EventFeed";
import {
  ENERGY_PRICE_PER_KWH,
  isOnline,
  type Device,
  type DeviceEvent,
  type RenderJob,
  type Telemetry,
} from "@/lib/renderwatch";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Live dashboard — RenderWatch" },
      {
        name: "description",
        content: "Live GPU temps, render progress and remote controls for your machines.",
      },
      { property: "og:title", content: "Live dashboard — RenderWatch" },
      {
        property: "og:description",
        content: "Live GPU temps, render progress and remote controls for your machines.",
      },
    ],
  }),
  component: Dashboard,
});

type PendingCommand = {
  command: "pause_job" | "resume_job" | "abort_job" | "shutdown" | "sleep";
  target?: string | null;
  label: string;
  description: string;
  destructive: boolean;
};

function Dashboard() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCommand | null>(null);

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
    refetchInterval: 10_000,
  });

  const devices = devicesQuery.data ?? [];
  const deviceId = selected ?? devices[0]?.id ?? null;
  const device = devices.find((d) => d.id === deviceId) ?? null;

  const telemetryQuery = useQuery({
    queryKey: ["telemetry", deviceId],
    enabled: !!deviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("telemetry_samples")
        .select("*")
        .eq("device_id", deviceId!)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as Telemetry | null;
    },
    refetchInterval: 2000,
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs", deviceId],
    enabled: !!deviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("render_jobs")
        .select("*")
        .eq("device_id", deviceId!)
        .order("updated_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as RenderJob[];
    },
    refetchInterval: 3000,
  });

  const eventsQuery = useQuery({
    queryKey: ["events", deviceId],
    enabled: !!deviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_events")
        .select("*")
        .eq("device_id", deviceId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as DeviceEvent[];
    },
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (!deviceId) return;
    const channel = supabase
      .channel(`device-${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "telemetry_samples",
          filter: `device_id=eq.${deviceId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["telemetry", deviceId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "render_jobs", filter: `device_id=eq.${deviceId}` },
        () => queryClient.invalidateQueries({ queryKey: ["jobs", deviceId] }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "device_events",
          filter: `device_id=eq.${deviceId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["events", deviceId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, queryClient]);

  const telemetry = telemetryQuery.data ?? null;
  const jobs = jobsQuery.data ?? [];
  const activeJobs = jobs.filter((j) => j.status === "running" || j.status === "paused");

  const energyCost = useMemo(() => {
    const running = activeJobs[0];
    const watts = Number(telemetry?.power_draw_w ?? telemetry?.gpu_power_w ?? 0);
    if (!running || !watts) return 0;
    const hours = (Date.now() - new Date(running.started_at).getTime()) / 3_600_000;
    return (watts / 1000) * hours * ENERGY_PRICE_PER_KWH;
  }, [activeJobs, telemetry]);

  async function sendCommand(cmd: PendingCommand) {
    if (!deviceId) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("device_commands").insert({
      device_id: deviceId,
      command: cmd.command,
      target: cmd.target ?? null,
      issued_by: userData.user?.id,
    });
    if (error) {
      toast.error("Could not send the command");
      return;
    }
    toast.success(`${cmd.label} sent to ${device?.name ?? "machine"}`);
  }

  async function toggleShutdownWhenFinished(value: boolean) {
    if (!deviceId) return;
    const { error } = await supabase
      .from("devices")
      .update({ shutdown_when_finished: value })
      .eq("id", deviceId);
    if (error) {
      toast.error("Could not update the setting");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["devices"] });
  }

  if (devicesQuery.isLoading) {
    return <p className="mono text-sm text-muted-foreground">Connecting…</p>;
  }

  if (!device) {
    return (
      <div className="panel mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold">No machine paired yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add your render machine and run the small background agent on it to start streaming live
          stats.
        </p>
        <Button asChild className="mt-6">
          <Link to="/machines">Add a machine</Link>
        </Button>
      </div>
    );
  }

  const online = isOnline(device);
  const gpuTemp = Number(telemetry?.gpu_temp_c ?? 0);
  const cpuTemp = Number(telemetry?.cpu_temp_c ?? 0);
  const vramUsed = Number(telemetry?.vram_used_mb ?? 0);
  const vramTotal = Number(telemetry?.vram_total_mb ?? 0);
  const power = Number(telemetry?.power_draw_w ?? telemetry?.gpu_power_w ?? 0);
  const thermal = device.thermal_limit_c;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {devices.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d.id)}
              className={`mono flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                d.id === deviceId
                  ? "border-primary bg-secondary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className={`size-2 rounded-full ${
                  isOnline(d) ? "live-dot bg-success" : "bg-muted-foreground"
                }`}
              />
              {d.name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Badge variant={online ? "outline" : "secondary"} className="mono">
            {online ? "streaming" : "agent offline"}
          </Badge>
        </div>
      </div>

      {gpuTemp >= thermal && (
        <div className="panel flex items-center gap-3 border-destructive/50 p-4 text-sm">
          <AlertTriangle className="size-5 text-destructive" />
          <span>
            Thermal warning: GPU is at{" "}
            <span className="mono text-destructive">{gpuTemp.toFixed(0)}°C</span>, above the{" "}
            {thermal}°C limit for this machine.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TelemetryGauge
          label="GPU temp"
          icon={Thermometer}
          value={gpuTemp ? gpuTemp.toFixed(0) : "—"}
          unit="°C"
          percent={(gpuTemp / 100) * 100}
          tone={gpuTemp >= thermal ? "danger" : gpuTemp >= thermal - 10 ? "warning" : "success"}
          sub={`fan ${telemetry?.gpu_fan_pct ?? "—"}% · load ${telemetry?.gpu_load_pct ?? "—"}%`}
        />
        <TelemetryGauge
          label="CPU temp"
          icon={Cpu}
          value={cpuTemp ? cpuTemp.toFixed(0) : "—"}
          unit="°C"
          percent={(cpuTemp / 100) * 100}
          tone={cpuTemp >= 90 ? "danger" : cpuTemp >= 80 ? "warning" : "primary"}
          sub={`load ${telemetry?.cpu_load_pct ?? "—"}%`}
        />
        <TelemetryGauge
          label="VRAM"
          icon={HardDrive}
          value={vramTotal ? (vramUsed / 1024).toFixed(1) : "—"}
          unit={vramTotal ? `/ ${(vramTotal / 1024).toFixed(0)} GB` : "GB"}
          percent={vramTotal ? (vramUsed / vramTotal) * 100 : 0}
          tone={vramTotal && vramUsed / vramTotal > 0.9 ? "warning" : "primary"}
          sub={`RAM ${telemetry?.ram_used_gb ?? "—"} / ${telemetry?.ram_total_gb ?? "—"} GB`}
        />
        <TelemetryGauge
          label="Power draw"
          icon={Zap}
          value={power ? power.toFixed(0) : "—"}
          unit="W"
          percent={Math.min(100, (power / 600) * 100)}
          tone="warning"
          sub={`≈ €${energyCost.toFixed(2)} this job`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="mono text-xs tracking-widest text-muted-foreground uppercase">
              Active render jobs
            </h2>
            <span className="mono text-xs text-muted-foreground">{activeJobs.length} running</span>
          </div>
          {activeJobs.length === 0 ? (
            <div className="panel p-6 text-sm text-muted-foreground">
              No render running right now. Start a render on {device.name} and it will appear here
              within a second.
            </div>
          ) : (
            activeJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onCommand={(command, j) =>
                  setPending({
                    command,
                    target: j.external_id ?? j.id,
                    label:
                      command === "abort_job"
                        ? "Cancel task"
                        : command === "pause_job"
                          ? "Pause render"
                          : "Resume render",
                    description:
                      command === "abort_job"
                        ? `This stops "${j.project_name}" on ${device.name}. Frames already written are kept.`
                        : `This ${command === "pause_job" ? "pauses" : "resumes"} "${j.project_name}" on ${device.name}.`,
                    destructive: command === "abort_job",
                  })
                }
              />
            ))
          )}

          <div className="panel space-y-4 p-5">
            <h3 className="mono text-xs tracking-widest text-muted-foreground uppercase">
              Machine controls
            </h3>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Shut down when finished</p>
                <p className="text-xs text-muted-foreground">
                  Powers off {device.name} once the queue completes.
                </p>
              </div>
              <Switch
                checked={device.shutdown_when_finished}
                onCheckedChange={toggleShutdownWhenFinished}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setPending({
                    command: "sleep",
                    label: "Sleep machine",
                    description: `${device.name} will go to sleep. Any running render is interrupted.`,
                    destructive: true,
                  })
                }
              >
                <Moon className="size-4" />
                Sleep
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  setPending({
                    command: "shutdown",
                    label: "Shut down now",
                    description: `${device.name} will power off immediately. Unsaved work may be lost.`,
                    destructive: true,
                  })
                }
              >
                <Power className="size-4" />
                Shut down now
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Flame className="size-4 text-warning" />
            <h2 className="mono text-xs tracking-widest text-muted-foreground uppercase">
              Live system log
            </h2>
          </div>
          <EventFeed events={eventsQuery.data ?? []} />
        </div>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.label}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) void sendCommand(pending);
                setPending(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
