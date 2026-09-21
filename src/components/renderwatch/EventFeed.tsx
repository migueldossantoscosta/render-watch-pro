import { CheckCircle2, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { DeviceEvent } from "@/lib/renderwatch";
import { ScrollArea } from "@/components/ui/scroll-area";

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: CircleAlert,
} as const;

const colors: Record<string, string> = {
  info: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
};

export function EventFeed({ events }: { events: DeviceEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="panel p-6 text-sm text-muted-foreground">
        No activity yet. Frame completions, errors and thermal warnings stream in here.
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <ScrollArea className="h-[560px]">
        <ul className="divide-y divide-border">
          {events.map((event) => {
            const Icon = icons[(event.level as keyof typeof icons) ?? "info"] ?? Info;
            return (
              <li key={event.id} className="flex gap-3 px-4 py-3">
                <Icon className={`mt-0.5 size-4 shrink-0 ${colors[event.level] ?? colors.info}`} />
                <div className="min-w-0 flex-1">
                  <p className="mono text-xs break-words">{event.message}</p>
                  <p className="mono mt-1 text-[10px] text-muted-foreground">
                    {new Date(event.created_at).toLocaleTimeString()}
                    {event.source ? ` · ${event.source}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
