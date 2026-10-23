export type BetterStackHealth = "operational" | "degraded" | "unknown";
export type MonitorState =
  | "up"
  | "down"
  | "validating"
  | "pending"
  | "paused"
  | "maintenance"
  | "unknown";
export interface BetterStackSla {
  availability: number;
  downtimeSeconds: number | null;
  incidents: number | null;
  longestIncidentSeconds: number | null;
  averageIncidentSeconds: number | null;
}
export interface BetterStackService {
  id: string;
  key: string;
  name: string;
  category: string;
  status: MonitorState;
  lastCheckedAt: string | null;
  createdAt: string | null;
  checkFrequencySeconds: number | null;
  allTime: BetterStackSla | null;
  days30: BetterStackSla | null;
  responseTime: {
    averageMs: number;
    p95Ms: number;
    samples: number;
    periodHours: number;
    series: { at: string; ms: number }[];
  } | null;
}
export interface BetterStackReport {
  source: "betterstack";
  status: BetterStackHealth;
  checkedAt: string;
  metricsUpdatedAt?: string;
  monitors: BetterStackService[];
  incidents: {
    id: string;
    serviceId: string;
    service: string;
    startedAt: string | null;
    resolvedAt: string | null;
    acknowledgedAt: string | null;
  }[];
  incidentsAvailable: boolean;
  period?: { from: string; to: string; label: string };
}
export function parseBetterStackStatus(
  value: unknown,
  now = Date.now()
): BetterStackHealth {
  if (!value || typeof value !== "object") return "unknown";
  const data = value as Record<string, unknown>;
  const checked =
    typeof data.checkedAt === "string" ? Date.parse(data.checkedAt) : NaN;
  if (
    data.source !== "betterstack" ||
    !Number.isFinite(checked) ||
    now - checked > 180000 ||
    checked - now > 30000
  )
    return "unknown";
  return data.status === "operational" || data.status === "degraded"
    ? data.status
    : "unknown";
}
async function fetchReportJson(signal?: AbortSignal): Promise<unknown> {
  for (const endpoint of [
    "https://api.tatakai.me/service-status.json",
    "https://tatakai.me/service-status.json",
  ]) {
    if (signal?.aborted) throw new Error("Monitoring request cancelled");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 8000);
    try {
      const response = await fetch(endpoint, {
        signal: controller.signal,
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) continue;
      const value = await response.json();
      if (value?.source === "betterstack") return value;
    } catch {
      if (signal?.aborted) throw new Error("Monitoring request cancelled");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  throw new Error("Better Stack status is unavailable");
}
export async function fetchBetterStackStatus(
  signal?: AbortSignal
): Promise<BetterStackHealth> {
  try {
    return parseBetterStackStatus(await fetchReportJson(signal));
  } catch {
    return "unknown";
  }
}
export async function fetchBetterStackReport(
  signal?: AbortSignal
): Promise<BetterStackReport> {
  const data = (await fetchReportJson(signal)) as BetterStackReport;
  if (
    data?.source !== "betterstack" ||
    typeof data.checkedAt !== "string" ||
    !Array.isArray(data.monitors)
  )
    throw new Error("Invalid monitoring report");
  return {
    ...data,
    status: parseBetterStackStatus(data),
    monitors: data.monitors.filter(
      (service) =>
        service &&
        typeof service.id === "string" &&
        typeof service.name === "string"
    ),
    incidents: Array.isArray(data.incidents) ? data.incidents : [],
    incidentsAvailable: data.incidentsAvailable === true,
  };
}
export function formatServiceDuration(
  value: number | null | undefined
): string {
  if (value == null || !Number.isFinite(value) || value < 0)
    return "Unavailable";
  value = Math.round(value);
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600)
    return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
  if (value < 86400)
    return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
  return `${Math.floor(value / 86400)}d ${Math.floor((value % 86400) / 3600)}h`;
}
export function formatServiceUptime(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) || value < 0 || value > 100
    ? "Unavailable"
    : `${value.toFixed(3)}%`;
}
