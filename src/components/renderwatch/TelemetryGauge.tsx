import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "danger";

const toneRing: Record<Tone, string> = {
  primary: "stroke-primary",
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-destructive",
};

const toneText: Record<Tone, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

export function TelemetryGauge({
  label,
  value,
  unit,
  percent,
  tone = "primary",
  icon: Icon,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  percent: number;
  tone?: Tone;
  icon: LucideIcon;
  sub?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const dash = (clamped / 100) * circumference;

  return (
    <div className="panel flex flex-col items-center gap-3 p-5">
      <div className="flex w-full items-center gap-2 text-xs tracking-wider text-muted-foreground uppercase">
        <Icon className={cn("size-4", toneText[tone])} />
        {label}
      </div>
      <div className="relative">
        <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
          <circle
            cx="56"
            cy="56"
            r={r}
            fill="none"
            strokeWidth="8"
            className="stroke-secondary"
          />
          <circle
            cx="56"
            cy="56"
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            className={cn("transition-all duration-500", toneRing[tone])}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("mono text-2xl font-bold", toneText[tone])}>{value}</span>
          {unit && <span className="mono text-[10px] text-muted-foreground">{unit}</span>}
        </div>
      </div>
      <p className="mono h-4 text-[11px] text-muted-foreground">{sub ?? ""}</p>
    </div>
  );
}
