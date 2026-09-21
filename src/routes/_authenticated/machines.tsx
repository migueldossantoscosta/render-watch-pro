import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, MonitorSmartphone, Plus, Sparkles, Trash2 } from "lucide-react";
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
    <div className="space-y-10">
      <div className="relative flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-2xl border border-border bg-card px-6 py-8 shadow-[var(--shadow-panel-value)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="relative">
          <p className="mono text-xs tracking-[0.3em] text-muted-foreground uppercase">Machines</p>
          <h1 className="text-glow mt-2 text-3xl font-bold tracking-tight">Your render fleet</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Pair a machine to start streaming live GPU telemetry and render progress straight to
            this dashboard.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setJustCreated(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="lg" className="relative shadow-glow">
              <Plus className="size-4" />
              Add machine
            </Button>
          </DialogTrigger>
          <DialogContent>
            {justCreated ? (
              <>
                <DialogHeader>
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="size-6" />
                  </div>
                  <DialogTitle className="text-center">{justCreated.name} added</DialogTitle>
                  <DialogDescription className="text-center">
                    Paste this pairing code into the RenderWatch agent on that machine the first
                    time it runs.
                  </DialogDescription>
                </DialogHeader>
                <div className="mono flex items-center justify-between rounded-xl border border-primary/40 bg-secondary px-4 py-3 text-xl tracking-[0.2em] shadow-glow">
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
                    className="w-full"
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

      {devicesQuery.isError ? (
        <div className="panel flex flex-col items-start gap-3 border-destructive/50 p-6 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-medium text-destructive">Failed to load machines</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Something went wrong while fetching your machines. Please try again.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => devicesQuery.refetch()}
            className="shrink-0"
          >
            Try again
          </Button>
        </div>
      ) : devicesQuery.isLoading ? (
        <p className="mono text-sm text-muted-foreground">Loading…</p>
      ) : devices.length === 0 ? (
        <div className="panel relative overflow-hidden p-10 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 mx-auto size-40 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl"
          />
          <div className="relative mx-auto flex size-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary shadow-glow">
            <MonitorSmartphone className="size-6" />
          </div>
          <h2 className="relative mt-4 text-lg font-semibold">No machines yet</h2>
          <p className="relative mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Add a machine to get a pairing code for the RenderWatch agent.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <div
              key={device.id}
              className="panel group space-y-4 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow"
            >
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
                <div className="mono flex items-center justify-between rounded-lg border border-primary/30 bg-secondary px-3 py-2 text-sm tracking-widest">
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
              <div className="flex gap-2 opacity-90 transition-opacity group-hover:opacity-100">
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
