import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminAnalytics } from '@/lib/adminAnalytics';
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from 'recharts';
import { Button } from '@/components/ui/button';

interface EngagementData {
  uniqueVisitors: number;
  pageViews: number;
  todayActive: number;
  measuredSince: string | null;
  daily: {
    day: string;
    visitors: number;
    members: number;
    new_visitors: number;
    retained: number;
    previous_active: number;
    active_seconds: number;
    engaged_visitors: number;
  }[];
  hourly: { hour: number; views: number }[];
  cohorts: { offset_days: number; eligible: number; returned: number }[];
  patterns: { weekday: number; hour: number; views: number }[];
}
export function EngagementInsights({ days }: { days: number }) {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: ['engagement-insights', days],
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: false,
    queryFn: ({signal}) => fetchAdminAnalytics<EngagementData>('admin_engagement_stats',days,signal),
  });
  if (query.isError)
    return (
      <div role="alert" className="rounded-xl border border-border p-5">
        <p className="text-sm">{t((query.error as Error)?.message === 'analytics-timeout' ? 'insights.timedOut' : 'insights.unavailable')}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void query.refetch()}
        >
          {t('insights.retry')}
        </Button>
      </div>
    );
  if (!query.data)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('insights.loading')}
      </p>
    );
  const data = query.data;
  const daily = data.daily.map((day) => ({
    ...day,
    minutes: Math.round(day.active_seconds / 60),
    returning: Math.max(0, day.visitors - day.new_visitors),
  }));
  const maxPattern = Math.max(1, ...data.patterns.map((cell) => cell.views));
  return (
    <section className="space-y-6 rounded-xl border border-border p-4 sm:p-6">
      <div>
        <h3 className="text-lg font-semibold">{t('insights.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('insights.definition')}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-5 lg:grid-cols-5">
        {[
          [t('insights.uniqueVisitors'), data.uniqueVisitors],
          [t('insights.dau'), data.todayActive],
          [t('insights.pageViews'), data.pageViews],
          ...[1, 7].map((offset) => {
            const cohort = data.cohorts.find(
              (row) => row.offset_days === offset
            );
            return [
              t('insights.retention', { day: offset }),
              cohort?.eligible
                ? `${((cohort.returned / cohort.eligible) * 100).toFixed(
                    1
                  )}% (${cohort.returned}/${cohort.eligible})`
                : t('insights.notMature'),
            ];
          }),
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-2 text-xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h4 className="mb-4 text-sm font-semibold">
            {t('insights.visitorTrend')}
          </h4>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={daily}>
                <CartesianGrid stroke="hsl(var(--border))" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Area
                  dataKey="visitors"
                  name={t('insights.visitors')}
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.12}
                  isAnimationActive={false}
                />
                <Area
                  dataKey="returning"
                  name={t('insights.returning')}
                  stroke="#10b981"
                  fill="none"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h4 className="mb-4 text-sm font-semibold">{t('insights.hourly')}</h4>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={data.hourly}>
                <XAxis dataKey="hour" fontSize={11} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="views"
                  name={t('insights.pageViews')}
                  fill="hsl(var(--primary))"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h4 className="mb-4 text-sm font-semibold">
            {t('insights.dailyTime')}
          </h4>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={daily}>
                <XAxis dataKey="day" fontSize={11} />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="minutes"
                  name={t('insights.minutes')}
                  fill="#10b981"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h4 className="mb-4 text-sm font-semibold">
            {t('insights.retainedDaily')}
          </h4>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={daily}>
                <XAxis dataKey="day" fontSize={11} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="retained"
                  name={t('insights.retained')}
                  fill="hsl(var(--primary))"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div>
        <h4 className="mb-4 text-sm font-semibold">
          {t('insights.weekPattern')}
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  UTC
                </th>
                {Array.from({ length: 24 }, (_, hour) => (
                  <th
                    scope="col"
                    key={hour}
                    className="font-normal tabular-nums"
                  >
                    {hour}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 7 }, (_, weekday) => {
                const label = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                  weekday: 'short',
                  timeZone: 'UTC',
                }).format(new Date(Date.UTC(2026, 9, 11 + weekday)));
                return (
                  <tr key={weekday}>
                    <th scope="row" className="pr-2 text-left font-normal">
                      {label}
                    </th>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const views =
                        data.patterns.find(
                          (cell) =>
                            cell.weekday === weekday && cell.hour === hour
                        )?.views || 0;
                      return (
                        <td
                          key={hour}
                          className="h-7 rounded-sm text-center tabular-nums"
                          style={{
                            backgroundColor: `hsl(var(--primary) / ${
                              views ? 0.15 + (0.65 * views) / maxPattern : 0.04
                            })`,
                          }}
                          title={`${label} ${hour}:00 UTC · ${views}`}
                        >
                          <span
                            className={views ? '' : 'text-muted-foreground'}
                          >
                            {views || '·'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t('insights.timeDefinition')}{' '}
        {data.measuredSince &&
          t('insights.measuredSince', {
            date: new Date(data.measuredSince).toLocaleDateString(
              i18n.resolvedLanguage
            ),
          })}
      </p>
    </section>
  );
}
