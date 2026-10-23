import { CheckCircle, AlertTriangle, XCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MonitorState } from "@/lib/betterStackStatus";
export const SERVICE_STATE_LABELS: Record<MonitorState, string> = {
  up: "Operational",
  down: "Down",
  validating: "Recovering",
  pending: "Awaiting first check",
  paused: "Paused",
  maintenance: "Maintenance",
  unknown: "Status unavailable",
};
export function ServiceHealthBadge({ state }: { state: MonitorState }) {
  const Icon =
    state === "up"
      ? CheckCircle
      : state === "down"
      ? XCircle
      : state === "validating" || state === "maintenance"
      ? AlertTriangle
      : Clock;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5",
        state === "up"
          ? "text-success"
          : state === "down"
          ? "text-destructive"
          : state === "validating" || state === "maintenance"
          ? "text-amber"
          : "text-muted-foreground"
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {SERVICE_STATE_LABELS[state] ?? SERVICE_STATE_LABELS.unknown}
    </Badge>
  );
}
