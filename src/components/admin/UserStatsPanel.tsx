import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  XCircle,
  Loader2,
  Users,
  TrendingUp,
  Activity,
  Globe,
  RotateCcw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { subDays, subMonths, startOfDay } from 'date-fns';
import {
  groupSignupsByPeriod,
  computeDau,
  computeRetention,
  topCountries as computeTopCountries,
} from '@/utils/userStats';
import type { TimeRange, UserStatsData } from '@/types/admin-dashboard';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
const makeQueryKey = (timeRange: TimeRange) =>
  ['admin_user_stats', timeRange] as const;

const RETENTION_QUERY_KEY = ['admin_user_stats_retention'] as const;

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------
function getRangeStart(timeRange: TimeRange): Date {
  const now = new Date();
  switch (timeRange) {
    case 'day':
      return startOfDay(now);
    case 'week':
      return startOfDay(subDays(now, 6));
    case 'month':
      return startOfDay(subDays(now, 29));
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function UserStatsPanel() {
  const [timeRange, setTimeRange] = useState<TimeRange>('week');

  // ------------------------------------------------------------------
  // Main stats query (time-range dependent)
  // ------------------------------------------------------------------
  const {
    data: stats,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: makeQueryKey(timeRange),
    queryFn: async (): Promise<Omit<UserStatsData, 'retentionPercent'>> => {
      const rangeStart = getRangeStart(timeRange);
      const rangeStartISO = rangeStart.toISOString();

      // 1. Total user count (all time, not range-scoped)
      const { count: totalCount, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      if (countError) throw countError;

      // 2. Signup timestamps in selected range — select only guaranteed columns
      const { data: signupRows, error: signupError } = await supabase
        .from('profiles')
        .select('created_at')
        .gte('created_at', rangeStartISO);
      if (signupError) throw signupError;

      const signupTimestamps = (signupRows ?? []).map((r) => r.created_at as string);
      const signupGroups = groupSignupsByPeriod(signupTimestamps, timeRange);

      // 2b. Country data — separate query with graceful failure (column may not exist yet)
      let countriesInput: { country: string | null }[] = [];
      try {
        const { data: countryRows } = await (supabase
          .from('profiles')
          .select('country')
          .gte('created_at', rangeStartISO) as any);
        countriesInput = (countryRows ?? []).map((r: any) => ({ country: r.country as string | null }));
      } catch (_) {
        // country column not yet present — skip
      }

      // 3. DAU from page_visits in selected range
      const { data: pageVisitRows, error: pvError } = await supabase
        .from('page_visits')
        .select('user_id, created_at')
        .gte('created_at', rangeStartISO);
      if (pvError) throw pvError;

      const dauSeries = computeDau(
        (pageVisitRows ?? []) as { user_id: string | null; created_at: string }[],
      );

      // 4. Top 5 countries from signups in range (countriesInput filled above)
      const topCountriesList = computeTopCountries(countriesInput, 5);

      return {
        totalCount: totalCount ?? 0,
        signupGroups,
        dauSeries,
        topCountries: topCountriesList,
      };
    },
    staleTime: 2 * 60 * 1000,   // 2 minutes — fresh enough for admin use
  });

  // ------------------------------------------------------------------
  // Retention query (fixed trailing 30-day cohort, independent of timeRange)
  // ------------------------------------------------------------------
  const {
    data: retentionPercent,
    isLoading: isRetentionLoading,
    isError: isRetentionError,
    refetch: refetchRetention,
  } = useQuery({
    queryKey: RETENTION_QUERY_KEY,
    queryFn: async (): Promise<number> => {
      const cohortStart = subMonths(new Date(), 1).toISOString();

      // Cohort: users who signed up in the last 30 days
      const { data: cohortRows, error: cohortError } = await supabase
        .from('profiles')
        .select('id, created_at')
        .gte('created_at', cohortStart);
      if (cohortError) throw cohortError;

      if (!cohortRows || cohortRows.length === 0) return 0;

      const cohortSignups = cohortRows.map((r) => ({
        user_id: r.id as string,
        created_at: r.created_at as string,
      }));

      const cohortUserIds = cohortSignups.map((u) => u.user_id);

      // Activity: page_visits within 7 days of signup for cohort users
      const { data: activityRows, error: activityError } = await supabase
        .from('page_visits')
        .select('user_id, created_at')
        .in('user_id', cohortUserIds)
        .not('user_id', 'is', null);
      if (activityError) throw activityError;

      return computeRetention(cohortSignups, activityRows ?? []);
    },
    staleTime: 5 * 60 * 1000,
  });

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  const handleRetry = useCallback(() => {
    void refetch();
    void refetchRetention();
  }, [refetch, refetchRetention]);

  const handleTimeRangeChange = useCallback(
    (range: TimeRange) => {
      setTimeRange(range);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------
  const renderTimeRangeSelector = () => (
    <div className="flex gap-2 bg-muted/50 p-1 rounded-xl">
      {(['day', 'week', 'month'] as TimeRange[]).map((range) => (
        <button
          key={range}
          onClick={() => handleTimeRangeChange(range)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            timeRange === range
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {range.charAt(0).toUpperCase() + range.slice(1)}
        </button>
      ))}
    </div>
  );

  const renderLoadingState = () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" />
    </div>
  );

  const renderErrorState = () => (
    <GlassPanel className="p-12 text-center border-destructive/20 bg-destructive/5">
      <XCircle className="w-10 h-10 text-destructive/50 mx-auto mb-4" />
      <p className="text-sm font-medium text-destructive mb-4">
        Failed to load user statistics
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRetry}
        className="gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </Button>
    </GlassPanel>
  );

  const renderEmptyChart = () => (
    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
      No data available for the selected period
    </div>
  );

  const renderSignupChart = () => {
    const data = stats?.signupGroups ?? [];
    return (
      <GlassPanel className="p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Signup Trend
        </h3>
        {data.length === 0 ? (
          renderEmptyChart()
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickFormatter={(val: string) => {
                    // Shorten date labels based on range
                    if (timeRange === 'month') return val.slice(0, 7);
                    return val.slice(5); // MM-DD
                  }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  name="New Signups"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </GlassPanel>
    );
  };

  const renderDauChart = () => {
    const data = stats?.dauSeries ?? [];
    return (
      <GlassPanel className="p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Daily Active Users (DAU)
        </h3>
        {data.length === 0 ? (
          renderEmptyChart()
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickFormatter={(val: string) => val.slice(5)} // MM-DD
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Bar
                  dataKey="dau"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  name="DAU"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </GlassPanel>
    );
  };

  const renderTopCountries = () => {
    const countries = stats?.topCountries ?? [];
    const maxCount = countries[0]?.count ?? 1;
    return (
      <GlassPanel className="p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          Top 5 Countries by Signups
        </h3>
        {countries.length === 0 ? (
          renderEmptyChart()
        ) : (
          <div className="space-y-3">
            {countries.map((c, idx) => (
              <div key={c.country} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {idx + 1}
                </div>
                <span className="text-sm font-medium w-32 truncate">{c.country}</span>
                <div className="flex-1">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${(c.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                  {c.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    );
  };

  const renderStatCards = () => {
    const totalCount = stats?.totalCount ?? 0;
    const retentionDisplay = isRetentionLoading
      ? '…'
      : isRetentionError
        ? 'N/A'
        : `${(retentionPercent ?? 0).toFixed(1)}%`;

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Total Users */}
        <GlassPanel className="p-5 bg-gradient-to-br from-blue-500 to-blue-700 border-0">
          <div className="flex items-start justify-between">
            <div className="p-2 rounded-xl bg-white/20">
              <Users className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold text-white">{totalCount.toLocaleString()}</p>
            <p className="text-sm text-white/70">Total Registered Users</p>
            <p className="text-xs text-white/50 mt-1">All time count</p>
          </div>
        </GlassPanel>

        {/* 7-Day Retention */}
        <GlassPanel className="p-5 bg-gradient-to-br from-emerald-500 to-emerald-700 border-0">
          <div className="flex items-start justify-between">
            <div className="p-2 rounded-xl bg-white/20">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold text-white">{retentionDisplay}</p>
            <p className="text-sm text-white/70">7-Day Retention</p>
            <p className="text-xs text-white/50 mt-1">
              Trailing 30-day cohort · fixed
            </p>
          </div>
        </GlassPanel>
      </div>
    );
  };

  // ------------------------------------------------------------------
  // Main render
  // ------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          User Statistics
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          {renderTimeRangeSelector()}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            disabled={isLoading || isFetching}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        renderLoadingState()
      ) : isError ? (
        renderErrorState()
      ) : (
        <div className="space-y-6">
          {/* Stat cards: total users + retention */}
          {renderStatCards()}

          {/* Charts: signups + DAU side by side on larger screens */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderSignupChart()}
            {renderDauChart()}
          </div>

          {/* Top countries */}
          {renderTopCountries()}
        </div>
      )}
    </div>
  );
}
