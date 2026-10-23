import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
import { ServiceHealthBadge } from "@/components/media/ServiceHealthBadge";
import { useBetterStack } from "@/hooks/api/useBetterStack";
import {
  parseBetterStackStatus,
  formatServiceDuration,
  formatServiceUptime,
  type BetterStackService,
} from "@/lib/betterStackStatus";

function dateLabel(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "Unavailable";
}
function Stat({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
function ServiceCard({
  service,
  period,
  fresh,
}: {
  service: BetterStackService;
  period: "allTime" | "days30";
  fresh: boolean;
}) {
  const sla = service[period];
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">{service.name}</CardTitle>
          <ServiceHealthBadge state={fresh ? service.status : "unknown"} />
        </div>
        <CardDescription>
          Checked {dateLabel(service.lastCheckedAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div>
          <p className="text-3xl font-semibold tabular-nums">
            {formatServiceUptime(sla?.availability)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {period === "allTime"
              ? "Total uptime since monitoring began"
              : "Uptime over the last 30 days"}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Downtime</dt>
            <dd className="mt-1 tabular-nums">
              {formatServiceDuration(sla?.downtimeSeconds)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Incidents</dt>
            <dd className="mt-1 tabular-nums">
              {sla?.incidents ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Longest incident</dt>
            <dd className="mt-1 tabular-nums">
              {formatServiceDuration(sla?.longestIncidentSeconds)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Average incident</dt>
            <dd className="mt-1 tabular-nums">
              {formatServiceDuration(sla?.averageIncidentSeconds)}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <p className="text-sm">
              {service.responseTime
                ? `${service.responseTime.averageMs.toLocaleString()} ms average`
                : "Response time unavailable"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {service.responseTime
                ? `p95 ${service.responseTime.p95Ms.toLocaleString()} ms · ${service.responseTime.samples.toLocaleString()} checks · last 24h`
                : "No response-time measurements returned"}
            </p>
          </div>
          {service.responseTime?.series?.length > 0 && (
            <div
              className="text-primary"
              role="img"
              aria-label={`${service.name} hourly response times over the last 24 hours`}
            >
              <Sparkline
                width={130}
                height={36}
                series={service.responseTime.series.map((point) => ({
                  date: point.at,
                  count: point.ms,
                }))}
              />
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <span>Monitoring since {dateLabel(service.createdAt)}</span>
        <span>
          Checks every {formatServiceDuration(service.checkFrequencySeconds)}
        </span>
      </CardFooter>
    </Card>
  );
}
export default function StatusPage() {
  const navigate = useNavigate();
  const desktop = useIsDesktopApp();
  const report = useBetterStack();
  const [period, setPeriod] = useState<"allTime" | "days30">("days30");
  const data = report.data;
  const fresh =
    !report.isError &&
    !!data &&
    Date.now() - Date.parse(data.checkedAt) <= 180000 &&
    Date.parse(data.checkedAt) - Date.now() <= 30000;
  const overall = data && fresh ? parseBetterStackStatus(data) : "unknown";
  const groups = useMemo(() => {
    const result = new Map<string, BetterStackService[]>();
    for (const service of data?.monitors ?? []) {
      const name = service.category || "Services";
      const list = result.get(name) ?? [];
      list.push(service);
      result.set(name, list);
    }
    return [...result];
  }, [data]);
  const website = data?.monitors.find((service) => service.key === "website");
  const uptimes = (data?.monitors ?? []).map(
    (service) => service.days30?.availability
  );
  const mean =
    uptimes.length && uptimes.every((value) => value != null)
      ? uptimes.reduce((sum, value) => sum + value!, 0) / uptimes.length
      : null;
  const active = data?.incidentsAvailable
    ? data.incidents.filter((incident) => !incident.resolvedAt).length
    : null;
  const healthy = fresh
    ? data?.monitors.filter((service) => service.status === "up").length
    : undefined;
  const OverallIcon =
    overall === "operational"
      ? CheckCircle
      : overall === "degraded"
      ? AlertTriangle
      : Clock;
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <main
        className={cn(
          "relative mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-6 pb-24 sm:px-6 md:pr-8",
          desktop ? "md:pl-6" : "md:pl-32"
        )}
      >
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 size-4" />
            Home
          </Button>
          <Button
            variant="outline"
            onClick={() => report.refetch()}
            disabled={report.isFetching}
          >
            <RefreshCw
              className={
                report.isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"
              }
            />
            Refresh status
          </Button>
        </header>
        <section
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 md:p-8"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" />
            Better Stack monitoring
          </div>
          <div className="flex items-center gap-3">
            <OverallIcon className="size-7 shrink-0" />
            <h1 className="font-display text-2xl font-bold md:text-3xl">
              {report.isPending
                ? "Checking service status"
                : overall === "operational"
                ? "All monitored services operational"
                : overall === "degraded"
                ? "Some services need attention"
                : "Service status unavailable"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Live checks and recorded availability from Better Stack. Refreshes
            every minute.
          </p>
          <p className="text-xs text-muted-foreground">
            Status updated: {dateLabel(data?.checkedAt)} · Uptime and response
            metrics updated: {dateLabel(data?.metricsUpdatedAt)}
          </p>
        </section>
        {(report.isError || (data && !fresh)) && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>
              {report.isError
                ? "Monitoring data could not be reached"
                : "Monitoring data is stale"}
            </AlertTitle>
            <AlertDescription>
              Current service health is unknown. Historical uptime remains
              available where recorded.
            </AlertDescription>
          </Alert>
        )}
        {report.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Website total uptime"
              value={formatServiceUptime(website?.allTime?.availability)}
              description="All time, since the Website monitor was created"
            />
            <Stat
              label="Average service uptime"
              value={formatServiceUptime(mean)}
              description="Mean across monitored services, last 30 days"
            />
            <Stat
              label="Services operational"
              value={
                healthy == null
                  ? "Unavailable"
                  : `${healthy} / ${data?.monitors.length ?? 0}`
              }
              description="Passing checks at the latest monitoring update"
            />
            <Stat
              label="Active incidents"
              value={active == null ? "Unavailable" : String(active)}
              description="Unresolved incidents in the latest Better Stack incident feed"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Server className="size-5" />
            Service categories
          </h2>
          <Tabs
            value={period}
            onValueChange={(value) => setPeriod(value as "allTime" | "days30")}
          >
            <TabsList aria-label="Uptime reporting period">
              <TabsTrigger value="days30">Last 30 days</TabsTrigger>
              <TabsTrigger value="allTime">All time</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {groups.map(([category, services]) => (
          <section key={category} className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {category}
            </h3>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  period={period}
                  fresh={fresh}
                />
              ))}
            </div>
          </section>
        ))}
        {!report.isPending && !groups.length && (
          <Card>
            <CardHeader>
              <CardTitle>No monitoring results available</CardTitle>
              <CardDescription>
                Better Stack has not supplied service measurements yet.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-5" />
              Recent incidents
            </CardTitle>
            <CardDescription>
              Latest recorded events. Older incidents remain included in each
              monitor’s uptime totals.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!data?.incidentsAvailable ? (
              <p className="text-sm text-muted-foreground">
                The incident feed is unavailable.
              </p>
            ) : !data.incidents.length ? (
              <p className="text-sm text-muted-foreground">
                No incidents returned by Better Stack.
              </p>
            ) : (
              data.incidents.map((incident) => (
                <article
                  key={incident.id}
                  className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4 last:border-0 last:pb-0"
                >
                  <div>
                    <h3 className="font-medium">{incident.service}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Started {dateLabel(incident.startedAt)}
                    </p>
                    {incident.resolvedAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Resolved {dateLabel(incident.resolvedAt)}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={incident.resolvedAt ? "secondary" : "outline"}
                  >
                    {incident.resolvedAt
                      ? "Resolved"
                      : incident.acknowledgedAt
                      ? "Acknowledged"
                      : "Investigating"}
                  </Badge>
                </article>
              ))
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Uptime reflects Better Stack’s monitoring history, including previous
          failed checks. A missing measurement is shown as unavailable. Response
          times combine measurements across Better Stack regions.
        </p>
      </main>
    </div>
  );
}
