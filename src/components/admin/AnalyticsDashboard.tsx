import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useMemo } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { motion } from 'framer-motion';
import {
  TrendingUp, Users, Eye, Play, Clock, Globe, MapPin,
  BarChart3, PieChart, Activity, ArrowUpRight,
  Download, Star, GitFork, Github, Smartphone, Monitor, ExternalLink, Target
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, PieChart as RePieChart, Pie, Cell
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { format } from '@/lib/localeFormat';
import { fetchAllReleases, fetchRepoStats, platformForAsset, formatCompact, GITHUB_REPO_URL } from '@/lib/github';
import { classifyChannel } from '@/hooks/api/useAnalytics';
import { WorldMap } from '@/components/admin/WorldMap';

const GA4_ACQUISITION_URL = 'https://analytics.google.com/analytics/web/#/reports/acquisition-overview';
const GA4_FUNNEL_URL = 'https://analytics.google.com/analytics/web/#/analysis';

export function AnalyticsDashboard() {
  useUiTranslation();
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('week');
  const days = timeRange === 'day' ? 1 : timeRange === 'week' ? 7 : 30;

  // Total users
  const { data: totalUsers } = useQuery({
    queryKey: ['analytics_total_users'],
    queryFn: async () => {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      return count || 0;
    },
  });

  // ---- Shared range fetches ------------------------------------------------
  // The dashboard used to run ~10 separate full-table scans of page_visits
  // (plus a per-day × 4 query fan-out) on every range change. On a busy site
  // that saturates the connection pool and blocks the renderer main thread
  // parsing megabytes of JSON — on desktop the 'unresponsive' guard then
  // reloads the whole page. Three scans now feed every metric below via
  // useMemo, with a 60s stale window and no refetch on window focus.
  const rangeStart = useMemo(() => subDays(new Date(), days).toISOString(), [days]);

  const { data: visits } = useQuery({
    queryKey: ['analytics_visits', timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('page_visits')
        .select('session_id, user_id, created_at, country, referrer, channel, utm_medium, referrer_host, page_path')
        .gte('created_at', rangeStart)
        .limit(20000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: watchRows } = useQuery({
    queryKey: ['analytics_watch_rows', timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watch_sessions')
        .select('session_id, user_id, watch_duration_seconds, genres, created_at')
        .gte('created_at', rangeStart);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: signupRows } = useQuery({
    queryKey: ['analytics_signups', timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, created_at')
        .gte('created_at', rangeStart);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Total visitors (unique sessions)
  const totalVisitors = useMemo(() => {
    const uniqueSessions = new Set((visits || []).map(v => v.session_id).filter(Boolean));
    return uniqueSessions.size;
  }, [visits]);

  // Guest vs logged in visitors
  const visitorBreakdown = useMemo(() => {
    const sessions = new Map<string, boolean>();
    (visits || []).forEach(v => {
      if (v.session_id && !sessions.has(v.session_id)) {
        sessions.set(v.session_id, !!v.user_id);
      }
    });

    let guests = 0, loggedIn = 0;
    sessions.forEach(isLoggedIn => isLoggedIn ? loggedIn++ : guests++);

    return { guests, loggedIn };
  }, [visits]);

  // Total watch time
  const totalWatchTime = useMemo(() => {
    return (watchRows || []).reduce((acc, s) => acc + (s.watch_duration_seconds || 0), 0);
  }, [watchRows]);

  // All countries by unique session — fed to the world map (no more top-5 cut).
  const topCountries = useMemo(() => {
    const countryCount = new Map<string, Set<string>>();
    (visits || []).forEach(v => {
      const name = (v.country ?? '').trim();
      if (name && v.session_id) {
        if (!countryCount.has(name)) {
          countryCount.set(name, new Set());
        }
        countryCount.get(name)!.add(v.session_id);
      }
    });

    return Array.from(countryCount.entries())
      .map(([name, sessions]) => ({ name, value: sessions.size }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }, [visits]);

  const unknownCountrySessions = useMemo(() => {
    const s = new Set<string>();
    (visits || []).forEach(v => {
      if (!(v.country ?? '').trim() && v.session_id) s.add(v.session_id);
    });
    return s.size;
  }, [visits]);

  // Top genres watched
  const topGenres = useMemo(() => {
    const genreTime = new Map<string, number>();
    (watchRows || []).forEach(s => {
      if (s.genres && Array.isArray(s.genres)) {
        s.genres.forEach((genre: string) => {
          genreTime.set(genre, (genreTime.get(genre) || 0) + (s.watch_duration_seconds || 0));
        });
      }
    });

    const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    return Array.from(genreTime.entries())
      .map(([name, value], i) => ({ name, value: Math.round(value / 60), color: colors[i % colors.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [watchRows]);

  // Daily visitor stats — bucketed in memory from the shared fetches (used to
  // be up to 120 sequential day-scoped requests).
  const dailyStats = useMemo(() => {
    const stats = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(now, i);
      const dayStart = startOfDay(date).getTime();
      const dayEnd = endOfDay(date).getTime();

      const daySessions = new Set<string>();
      // DAU identity: logged-in user id, else guest session id. The old code
      // only counted logged-in user_ids, so a mostly logged-out day read 0.
      const dayActives = new Set<string>();
      (visits || []).forEach(v => {
        const t = new Date(v.created_at).getTime();
        if (t < dayStart || t > dayEnd || !v.session_id) return;
        daySessions.add(v.session_id);
        dayActives.add(v.user_id ? `u:${v.user_id}` : `s:${v.session_id}`);
      });

      let watchMinutes = 0;
      (watchRows || []).forEach(s => {
        const t = new Date(s.created_at).getTime();
        if (t >= dayStart && t <= dayEnd) watchMinutes += (s.watch_duration_seconds || 0);
      });
      watchMinutes = watchMinutes / 60;

      let newUsers = 0;
      (signupRows || []).forEach(p => {
        const t = new Date(p.created_at).getTime();
        if (t >= dayStart && t <= dayEnd) newUsers++;
      });

      stats.push({
        date: format(date, timeRange === 'day' ? 'HH:mm' : 'MMM dd'),
        visitors: daySessions.size,
        dau: dayActives.size,
        watchTime: Math.round(watchMinutes),
        newUsers,
        retention: daySessions.size > 0 ? Math.round((dayActives.size / daySessions.size) * 100) : 0
      });
    }

    return stats;
  }, [visits, watchRows, signupRows, days, timeRange]);

  // Hourly activity
  const hourlyActivity = useMemo(() => {
    const todayStart = startOfDay(new Date()).getTime();
    const hourCounts = new Array(24).fill(0);
    (visits || []).forEach(v => {
      const t = new Date(v.created_at).getTime();
      if (t < todayStart) return;
      hourCounts[new Date(t).getHours()]++;
    });

    return hourCounts.map((count, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      visits: count,
    }));
  }, [visits]);

  // Referrer channels — prefers the stored `channel` column (written by
  // trackPageVisit), falling back to the shared classifier for older rows.
  const referrerChannels = useMemo(() => {
    const channels = new Map<string, Set<string>>();
    (visits || []).forEach(v => {
      const channel = v.channel || classifyChannel(v.referrer, v.utm_medium);
      if (!channels.has(channel)) {
        channels.set(channel, new Set());
      }
      channels.get(channel)!.add(v.session_id);
    });

    const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    return Array.from(channels.entries())
      .map(([name, sessions], i) => ({
        name,
        value: sessions.size,
        color: colors[i % colors.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [visits]);

  // Top referring hosts (where the traffic actually comes from).
  const topReferrers = useMemo(() => {
    const hostSessions = new Map<string, Set<string>>();
    (visits || []).forEach((v) => {
      let host = (v.referrer_host || '').toLowerCase();
      if (!host && v.referrer) {
        try {
          host = new URL(v.referrer).hostname.toLowerCase();
        } catch {
          host = '';
        }
      }
      if (!host || !v.session_id) return;
      if (!hostSessions.has(host)) hostSessions.set(host, new Set());
      hostSessions.get(host)!.add(v.session_id);
    });

    return Array.from(hostSessions.entries())
      .map(([host, sessions]) => ({ host, sessions: sessions.size }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8);
  }, [visits]);

  // Session quality metrics
  const sessionQuality = useMemo(() => {
    const sessionPageCounts = new Map<string, number>();
    let totalPageViews = 0;
    (visits || []).forEach((visit) => {
      const sessionId = String(visit.session_id || '').trim();
      if (!sessionId) return;
      totalPageViews++;
      sessionPageCounts.set(sessionId, (sessionPageCounts.get(sessionId) || 0) + 1);
    });

    const totalSessions = sessionPageCounts.size;
    const returningSessions = Array.from(sessionPageCounts.values()).filter((count) => count > 1).length;
    const returningRate = totalSessions > 0 ? Math.round((returningSessions / totalSessions) * 100) : 0;
    const avgPagesPerSession = totalSessions > 0
      ? Number((totalPageViews / totalSessions).toFixed(2))
      : 0;

    const totalWatchSeconds =
      (watchRows || []).reduce((acc, session) => acc + (session.watch_duration_seconds || 0), 0);
    const watchSessionCount = (watchRows || []).length;
    const avgWatchMinutes = watchSessionCount > 0
      ? Math.round((totalWatchSeconds / watchSessionCount) / 60)
      : 0;

    return {
      totalSessions,
      totalPageViews,
      returningSessions,
      returningRate,
      avgPagesPerSession,
      avgWatchMinutes,
    };
  }, [visits, watchRows]);

  // Top page paths by unique sessions
  const topPages = useMemo(() => {
    const pathSessions = new Map<string, Set<string>>();
    (visits || []).forEach((visit) => {
      const sessionId = String(visit.session_id || '').trim();
      if (!sessionId) return;

      const rawPath = String(visit.page_path || '/').trim() || '/';
      const normalizedPath = rawPath.replace(/\?.*$/, '') || '/';

      if (!pathSessions.has(normalizedPath)) {
        pathSessions.set(normalizedPath, new Set());
      }
      pathSessions.get(normalizedPath)!.add(sessionId);
    });

    return Array.from(pathSessions.entries())
      .map(([path, sessions]) => ({ path, sessions: sessions.size }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8);
  }, [visits]);

  // Success funnel: Visit → Signup → Activation (first watch) → Retention
  // (active on 2+ distinct days). All rates computed over the selected window.
  const funnel = useMemo(() => {
    const sessionCounts = new Map<string, number>();
    const userDays = new Map<string, Set<string>>();
    (visits || []).forEach((v) => {
      const sid = String(v.session_id || '').trim();
      if (sid) sessionCounts.set(sid, (sessionCounts.get(sid) || 0) + 1);
      if (v.user_id) {
        const day = String(v.created_at || '').slice(0, 10);
        if (!userDays.has(v.user_id)) userDays.set(v.user_id, new Set());
        userDays.get(v.user_id)!.add(day);
      }
    });

    const visitors = sessionCounts.size;
    const bounced = Array.from(sessionCounts.values()).filter((c) => c <= 1).length;
    const newUserIds = ((signupRows || []).map((p) => p.user_id).filter(Boolean)) as string[];
    const signups = newUserIds.length;
    const watchers = new Set((watchRows || []).map((w) => w.user_id).filter(Boolean));
    const activated = newUserIds.filter((id) => watchers.has(id)).length;
    const loggedInUsers = userDays.size;
    const retained = Array.from(userDays.values()).filter((d) => d.size >= 2).length;

    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
    return {
      visitors,
      signups,
      activated,
      retained,
      loggedInUsers,
      signupRate: pct(signups, visitors),
      activationRate: pct(activated, signups),
      retentionRate: pct(retained, loggedInUsers),
      bounceRate: pct(bounced, visitors),
    };
  }, [visits, watchRows, signupRows]);

  // GitHub releases & downloads (snozxyx/tatakai) — real download counts per release/platform
  const { data: githubData } = useQuery({
    queryKey: ['analytics_github_releases'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [releases, repo] = await Promise.all([fetchAllReleases(), fetchRepoStats()]);
      if (!releases || releases.length === 0) return null;

      const perRelease = releases.map((r) => ({
        version: r.tag_name.replace(/^v/i, ''),
        downloads: r.assets.reduce((s, a) => s + (a.download_count || 0), 0),
        date: (r.published_at || '').split('T')[0],
      }));
      const totalDownloads = perRelease.reduce((s, r) => s + r.downloads, 0);

      // Mobile = the Android APK + iOS IPA artifacts (Capacitor builds, not the
      // desktop installers), so the mobile traction is visible on its own rather
      // than buried inside the desktop installer total.
      let mobileDownloads = 0;
      let mobileDownloadsDesktop = 0;

      const platform = new Map<string, number>();
      releases.forEach((r) =>
        r.assets.forEach((a) => {
          const k = platformForAsset(a.name);
          if (k) {
            platform.set(k, (platform.get(k) || 0) + (a.download_count || 0));
            if (k === 'android' || k === 'ios') mobileDownloads += a.download_count || 0;
            else mobileDownloadsDesktop += a.download_count || 0;
          }
        })
      );
      const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];
      const perPlatform = Array.from(platform.entries())
        .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }))
        .sort((a, b) => b.value - a.value);

      return {
        totalDownloads,
        mobileDownloads,
        desktopDownloads: mobileDownloadsDesktop,
        stars: repo?.stargazers_count || 0,
        forks: repo?.forks_count || 0,
        latestVersion: perRelease[0]?.version || 'N/A',
        perRelease: perRelease.slice(0, 10).reverse(),
        perPlatform,
      };
    },
  });

  // Today breakdown for the DAU card subtitle (members vs guests).
  const todayBreakdown = useMemo(() => {
    const todayStart = startOfDay(new Date()).getTime();
    const members = new Set<string>();
    const guests = new Set<string>();
    (visits || []).forEach(v => {
      const t = new Date(v.created_at).getTime();
      if (t < todayStart || !v.session_id) return;
      if (v.user_id) members.add(v.user_id);
      else guests.add(v.session_id);
    });
    return { members: members.size, guests: guests.size, total: members.size + guests.size };
  }, [visits]);

  const formatWatchTime = (seconds: number) => {    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const statCards = [
    {
      get title() { return uiI18n.t('app.total_users_a028fce2'); },
      value: totalUsers?.toLocaleString(uiI18n.language) || '0',
      get subtitle() { return uiI18n.t('app.registered_accounts_ecf38c68'); },
      icon: <Users className="w-5 h-5" />,
      color: 'from-blue-500 to-blue-700',
    },
    {
      get title() { return uiI18n.t('app.total_visitors_af51227e'); },
      value: totalVisitors?.toLocaleString(uiI18n.language) || '0',
      get subtitle() { return uiI18n.t('app.i18n_value_0_guests_i18n_value_1_logged_in_1ecd2e23', { value0: visitorBreakdown?.guests || 0, value1: visitorBreakdown?.loggedIn || 0 }); },
      icon: <Eye className="w-5 h-5" />,
      color: 'from-green-500 to-green-700',
    },
    {
      get title() { return uiI18n.t('app.watch_time_c49f058c'); },
      value: formatWatchTime(totalWatchTime || 0),
      get subtitle() { return uiI18n.t('app.last_i18n_value_0_days_6733129f', { value0: days }); },
      icon: <Clock className="w-5 h-5" />,
      color: 'from-purple-500 to-purple-700',
    },
    {
      get title() { return uiI18n.t('app.dau_today_54758960'); },
      value: (todayBreakdown.total || dailyStats?.[dailyStats.length - 1]?.dau || 0).toLocaleString(uiI18n.language),
      get subtitle() { return uiI18n.t('app.i18n_value_0_members_i18n_value_1_guests_5892a3dc', { value0: todayBreakdown.members, value1: todayBreakdown.guests }); },
      icon: <Activity className="w-5 h-5" />,
      color: 'from-pink-500 to-rose-700',
    },
    {
      get title() { return uiI18n.t('app.top_country_4ee8868c'); },
      value: topCountries?.[0]?.name || 'N/A',
      get subtitle() { return uiI18n.t('app.i18n_value_0_visitors_77a4822c', { value0: topCountries?.[0]?.value || 0 }); },
      icon: <Globe className="w-5 h-5" />,
      color: 'from-orange-500 to-orange-700',
    },
    {
      get title() { return uiI18n.t('app.page_depth_d4ee2e80'); },
      value: String(sessionQuality?.avgPagesPerSession || 0),
      get subtitle() { return uiI18n.t('app.avg_pages_per_session_a1e78f08'); },
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'from-cyan-500 to-cyan-700',
    },
    {
      get title() { return uiI18n.t('app.returning_sessions_5f3a36ee'); },
      value: `${sessionQuality?.returningRate || 0}%`,
      get subtitle() { return uiI18n.t('app.i18n_value_0_repeat_sessions_2c9e80f8', { value0: sessionQuality?.returningSessions || 0 }); },
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'from-emerald-500 to-emerald-700',
    },
    {
      get title() { return uiI18n.t('app.avg_watch_session_3f8cc7b1'); },
      value: `${sessionQuality?.avgWatchMinutes || 0}m`,
      get subtitle() { return uiI18n.t('app.per_watch_session_eb55894f'); },
      icon: <Play className="w-5 h-5" />,
      color: 'from-violet-500 to-violet-700',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          {uiI18n.t('app.analytics_overview_36307b68')}
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <a
            href={GA4_ACQUISITION_URL}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            {uiI18n.t('app.ga4_acquisition_b3620a1d')} <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={GA4_FUNNEL_URL}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            {uiI18n.t('app.ga4_funnels_be6e7eb6')} <ExternalLink className="w-3 h-3" />
          </a>
        <div className="flex gap-2 bg-muted/50 p-1 rounded-xl">
          {(['day', 'week', 'month'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${timeRange === range
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'}`}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Success funnel: Visit → Signup → Activation → Retention */}
      <GlassPanel className="p-6">
        <h3 className="font-medium mb-1 flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          {uiI18n.t('app.success_funnel_d63a43d1')}
        </h3>
        <p className="text-xs text-muted-foreground mb-5">
          {uiI18n.t('app.signup_new_account_activation_watched_within_the_4bc00698')}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { get label() { return uiI18n.t('app.visitors_f8f3b6f9'); }, value: funnel?.visitors ?? 0, rate: null as number | null },
            { get label() { return uiI18n.t('app.signups_09c26725'); }, value: funnel?.signups ?? 0, rate: funnel?.signupRate ?? 0 },
            { get label() { return uiI18n.t('app.activated_a0b861f6'); }, value: funnel?.activated ?? 0, rate: funnel?.activationRate ?? 0 },
            { get label() { return uiI18n.t('app.retained_ae868d9a'); }, value: funnel?.retained ?? 0, rate: funnel?.retentionRate ?? 0 },
            { get label() { return uiI18n.t('app.bounce_rate_f45a2ab6'); }, value: `${funnel?.bounceRate ?? 0}%`, rate: null },
          ].map((step) => (
            <div key={step.label} className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <p className="text-2xl font-bold">{typeof step.value === 'number' ? step.value.toLocaleString(uiI18n.language) : step.value}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-1">{step.label}</p>
              {step.rate !== null && (
                <div className="mt-2">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, step.rate)}%` }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{step.rate}{uiI18n.t('app.conversion_53fca3ce')}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </GlassPanel>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <GlassPanel className={`p-5 bg-gradient-to-br ${stat.color} border-0`}>
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-xl bg-white/20">
                  {stat.icon}
                </div>
                <ArrowUpRight className="w-4 h-4 text-white/70" />
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-white/70">{stat.title}</p>
                <p className="text-xs text-white/50 mt-1">{stat.subtitle}</p>
              </div>
            </GlassPanel>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visitor Trends */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {uiI18n.t('app.visitor_trends_98544aab')}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyStats || []}>
                <defs>
                  <linearGradient id="visitorsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  stroke="hsl(var(--primary))"
                  fill="url(#visitorsGrad)"
                  strokeWidth={2}
                  name="Visitors"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        {/* Top Genres */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" />
            {uiI18n.t('app.most_watched_genres_5d97a59a')}
          </h3>
          <div className="h-64 flex items-center">
            {topGenres && topGenres.length > 0 ? (
              <>
                <ResponsiveContainer width="50%" height="100%">
                  <RePieChart>
                    <Pie
                      data={topGenres}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {topGenres.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {topGenres.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm flex-1">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.value}m</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="w-full text-center text-muted-foreground">{uiI18n.t('app.no_genre_data_yet_fe691902')}</div>
            )}
          </div>
        </GlassPanel>
      </div>

      {/* World map + acquisition */}
      <div className="grid grid-cols-1 gap-6">
        {/* World map — every country, not just top 5 */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-1 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            {uiI18n.t('app.world_map_where_visitors_come_from_8f5877b8')}
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            {uiI18n.t('app.bubbles_sized_by_unique_visitors_in_range_hover__c8c28e80')}
          </p>
          {topCountries && topCountries.length > 0 ? (
            <WorldMap data={topCountries} unknownCount={unknownCountrySessions} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">{uiI18n.t('app.no_country_data_yet_70cdd1c4')}</div>
          )}
        </GlassPanel>

        {/* Referrer Channels */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            {uiI18n.t('app.acquisition_channels_b9b0bb0e')}
          </h3>
          <div className="h-48 flex items-center">
            {referrerChannels && referrerChannels.length > 0 ? (
              <>
                <ResponsiveContainer width="50%" height="100%">
                  <RePieChart>
                    <Pie
                      data={referrerChannels}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {referrerChannels.map((entry: any, index: number) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {referrerChannels.map((item: any) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs flex-1">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center w-full text-muted-foreground">{uiI18n.t('app.no_acquisition_data_yet_1a5b5232')}</div>
            )}
          </div>
          {topReferrers && topReferrers.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/10">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                {uiI18n.t('app.top_referring_sites_be12eec7')}
              </p>
              <div className="space-y-2">
                {topReferrers.map((r) => (
                  <div key={r.host} className="flex items-center gap-3">
                    <span className="text-xs font-mono truncate flex-1">{r.host}</span>
                    <div className="flex-1 max-w-32">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(r.sessions / (topReferrers[0]?.sessions || 1)) * 100}%` }}
                          className="h-full bg-primary rounded-full"
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">{r.sessions}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                {uiI18n.t('app.tip_tag_campaigns_with_utm_source_amp_utm_medium_feb03ed3')}
              </p>
            </div>
          )}
        </GlassPanel>
      </div>

      {/* Traffic Rhythm and Top Paths */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            {uiI18n.t('app.hourly_traffic_pattern_2ee1894a')}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyActivity || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={2} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="visits" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Visits" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            {uiI18n.t('app.most_visited_paths_b4d55b97')}
          </h3>
          {topPages && topPages.length > 0 ? (
            <div className="space-y-3">
              {topPages.map((entry) => (
                <div key={entry.path} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium truncate">{entry.path}</p>
                    <span className="text-xs text-muted-foreground shrink-0">{entry.sessions} {uiI18n.t('app.sessions_781791f5')}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(entry.sessions / (topPages[0]?.sessions || 1)) * 100}%` }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">{uiI18n.t('app.no_page_path_data_yet_e9f3c5c0')}</div>
          )}
        </GlassPanel>
      </div>

      {/* Retention and DAU Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {uiI18n.t('app.user_engagement_9d2c8911')}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyStats || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} unit="%" />
                <Tooltip />
                <Area type="monotone" dataKey="retention" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Logged-in Ratio" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            {uiI18n.t('app.daily_watch_time_a969389c')}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyStats || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} unit="m" />
                <Tooltip />
                <Area type="monotone" dataKey="watchTime" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} name="Watch Mins" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      </div>

      {/* GitHub Releases & Downloads */}
      {githubData && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Github className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{uiI18n.t('app.github_releases_downloads_c128b47d')}</h2>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary transition-colors ml-1"
            >
              {uiI18n.t('app.snozxyx_tatakai_3e548ec5')}
            </a>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { icon: Download, get label() { return uiI18n.t('app.total_downloads_85b696f8'); }, value: formatCompact(githubData.totalDownloads), color: 'text-violet-400' },
              { icon: Smartphone, get label() { return uiI18n.t('app.mobile_downloads_cfebdf6a'); }, value: formatCompact(githubData.mobileDownloads), color: 'text-emerald-400' },
              { icon: Monitor, get label() { return uiI18n.t('app.desktop_downloads_620f5c47'); }, value: formatCompact(githubData.desktopDownloads), color: 'text-blue-400' },
              { icon: Star, get label() { return uiI18n.t('app.github_stars_d00bd5ef'); }, value: formatCompact(githubData.stars), color: 'text-amber-400' },
              { icon: TrendingUp, get label() { return uiI18n.t('app.latest_version_2a2e9c3f'); }, value: `v${githubData.latestVersion}`, color: 'text-emerald-400' },
            ].map((s) => (
              <GlassPanel key={s.label} className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div className="text-2xl font-bold">{s.value}</div>
              </GlassPanel>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlassPanel className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                {uiI18n.t('app.downloads_per_release_aaf2abec')}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={githubData.perRelease}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="version" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip formatter={(v: number) => [v.toLocaleString(uiI18n.language), 'Downloads']} />
                    <Bar dataKey="downloads" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Downloads" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassPanel>

            <GlassPanel className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-primary" />
                {uiI18n.t('app.downloads_by_platform_b1497a96')}
              </h3>
              {githubData.perPlatform.length > 0 ? (
                <div className="flex items-center gap-6">
                  <div className="h-56 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <RePieChart>
                        <Pie
                          data={githubData.perPlatform}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {githubData.perPlatform.map((p) => (
                            <Cell key={p.name} fill={p.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [v.toLocaleString(uiI18n.language), 'Downloads']} />
                      </RePieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {githubData.perPlatform.map((p) => (
                      <div key={p.name} className="flex items-center gap-2 text-sm">
                        <span className="w-3 h-3 rounded-sm" style={{ background: p.color }} />
                        <span className="capitalize text-muted-foreground">{p.name}</span>
                        <span className="font-semibold ml-auto">{formatCompact(p.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                  {uiI18n.t('app.no_platform_tagged_assets_found_5d67278e')}
                </div>
              )}
            </GlassPanel>
          </div>
        </div>
      )}
    </div>
  );
}
