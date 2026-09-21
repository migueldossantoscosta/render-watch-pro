import { Film, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDuration, elapsedSeconds, type RenderJob } from "@/lib/renderwatch";

export function JobCard({
  job,
  onCommand,
}: {
  job: RenderJob;
  onCommand: (command: "pause_job" | "resume_job" | "abort_job", job: RenderJob) => void;
}) {
  const pct = Math.max(0, Math.min(100, Number(job.progress) || 0));
  const paused = job.status === "paused";

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Film className="size-4 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{job.project_name}</p>
          <p className="mono text-xs text-muted-foreground">{job.engine}</p>
        </div>
        <Badge variant={paused ? "secondary" : job.status === "failed" ? "destructive" : "outline"}>
          {job.status}
        </Badge>
      </div>

      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mono mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="text-primary">{pct.toFixed(1)}%</span>
          <span>
            frame {job.current_frame}
            {job.total_frames ? ` / ${job.total_frames}` : ""}
          </span>
          {job.samples_total != null && (
            <span>
              {job.samples_done ?? 0}/{job.samples_total} spp
            </span>
          )}
          <span>elapsed {formatDuration(elapsedSeconds(job.started_at))}</span>
          <span>ETA {formatDuration(job.eta_seconds)}</span>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onCommand(paused ? "resume_job" : "pause_job", job)}
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          {paused ? "Resume" : "Pause render"}
        </Button>
        <Button size="sm" variant="destructive" onClick={() => onCommand("abort_job", job)}>
          <X className="size-4" />
          Cancel task
        </Button>
      </div>
    </div>
  );
}
