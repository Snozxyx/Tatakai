import { useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { motion } from 'framer-motion';
import { 
  TrendingUp, Users, Eye, Play, Clock, Globe, MapPin,
  BarChart3, PieChart, Activity, ArrowUpRight
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, PieChart as RePieChart, Pie, Cell
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

export function AnalyticsDashboard() {
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

  // Total visitors (unique sessions)
  const { data: totalVisitors } = useQuery({
    queryKey: ['analytics_total_visitors', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data } = await supabase
        .from('page_visits')
        .select('session_id')
        .gte('created_at', startDate);
      
      const uniqueSessions = new Set(data?.map(v => v.session_id) || []);
      return uniqueSessions.size;
    },
  });

  // Guest vs logged in visitors
  const { data: visitorBreakdown } = useQuery({
    queryKey: ['analytics_visitor_breakdown', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data } = await supabase
        .from('page_visits')
        .select('user_id, session_id')
        .gte('created_at', startDate);
      
      const sessions = new Map<string, boolean>();
      data?.forEach(v => {
        if (!sessions.has(v.session_id)) {
          sessions.set(v.session_id, !!v.user_id);
        }
      });
      
      let guests = 0, loggedIn = 0;
      sessions.forEach(isLoggedIn => isLoggedIn ? loggedIn++ : guests++);
      
      return { guests, loggedIn };
    },
  });

  // Total watch time
  const { data: totalWatchTime } = useQuery({
    queryKey: ['analytics_total_watch_time', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data } = await supabase
        .from('watch_sessions')
        .select('watch_duration_seconds')
        .gte('created_at', startDate);
      
      const totalSeconds = data?.reduce((acc, s) => acc + (s.watch_duration_seconds || 0), 0) || 0;
      return totalSeconds;
    },
  });

  // Top countries
  const { data: topCountries } = useQuery({
    queryKey: ['analytics_top_countries', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data } = await supabase
        .from('page_visits')
        .select('country, session_id')
        .gte('created_at', startDate)
        .not('country', 'is', null);
      
      const countryCount = new Map<string, Set<string>>();
      data?.forEach(v => {
        if (v.country) {
          if (!countryCount.has(v.country)) {
            countryCount.set(v.country, new Set());
          }
          countryCount.get(v.country)!.add(v.session_id);
        }
      });
      
      return Array.from(countryCount.entries())
        .map(([name, sessions]) => ({ name, value: sessions.size }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    },
  });

  // Top genres watched
  const { data: topGenres } = useQuery({
    queryKey: ['analytics_top_genres', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data } = await supabase
        .from('watch_sessions')
        .select('genres, watch_duration_seconds')
        .gte('created_at', startDate);
      
      const genreTime = new Map<string, number>();
      data?.forEach(s => {
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
    },
  });

  // Daily visitor stats
  const { data: dailyStats } = useQuery({
    queryKey: ['analytics_daily_stats', timeRange],
    queryFn: async () => {
      const stats = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayStart = startOfDay(date).toISOString();
        const dayEnd = endOfDay(date).toISOString();
        
        const [visitsResult, watchResult, usersResult] = await Promise.all([
          supabase
            .from('page_visits')
            .select('session_id, user_id')
            .gte('created_at', dayStart)
            .lte('created_at', dayEnd),
          supabase
            .from('watch_sessions')
            .select('watch_duration_seconds')
            .gte('created_at', dayStart)
            .lte('created_at', dayEnd),
          supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', dayStart)
            .lte('created_at', dayEnd),
        ]);

        const uniqueSessions = new Set(visitsResult.data?.map(v => v.session_id) || []);
        const watchMinutes = (watchResult.data?.reduce((acc, s) => acc + (s.watch_duration_seconds || 0), 0) || 0) / 60;

        stats.push({
          date: format(date, timeRange === 'day' ? 'HH:mm' : 'MMM dd'),
          visitors: uniqueSessions.size,
          watchTime: Math.round(watchMinutes),
          newUsers: usersResult.count || 0,
        });
      }
      
      return stats;
    },
  });

  // Hourly activity
  const { data: hourlyActivity } = useQuery({
    queryKey: ['analytics_hourly'],
    queryFn: async () => {
      const today = startOfDay(new Date()).toISOString();
      const { data } = await supabase
        .from('page_visits')
        .select('created_at')
        .gte('created_at', today);
      
      const hourCounts = new Array(24).fill(0);
      data?.forEach(v => {
        const hour = new Date(v.created_at).getHours();
        hourCounts[hour]++;
      });
      
      return hourCounts.map((count, i) => ({
        hour: `${i.toString().padStart(2, '0')}:00`,
        visits: count,
      }));
    },
  });

  const formatWatchTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const statCards = [
    {
      title: 'Total Users',
      value: totalUsers?.toLocaleString() || '0',
      subtitle: 'Registered accounts',
      icon: <Users className="w-5 h-5" />,
      color: 'from-blue-500 to-blue-700',
    },
    {
      title: 'Total Visitors',
      value: totalVisitors?.toLocaleString() || '0',
      subtitle: `${visitorBreakdown?.guests || 0} guests, ${visitorBreakdown?.loggedIn || 0} logged in`,
      icon: <Eye className="w-5 h-5" />,
      color: 'from-green-500 to-green-700',
    },
    {
      title: 'Watch Time',
      value: formatWatchTime(totalWatchTime || 0),
      subtitle: `Last ${days} days`,
      icon: <Clock className="w-5 h-5" />,
      color: 'from-purple-500 to-purple-700',
    },
    {
      title: 'Top Country',
      value: topCountries?.[0]?.name || 'N/A',
      subtitle: `${topCountries?.[0]?.value || 0} visitors`,
      icon: <Globe className="w-5 h-5" />,
      color: 'from-orange-500 to-orange-700',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Analytics Overview
        </h2>
        <div className="flex gap-2 bg-muted/50 p-1 rounded-xl">
          {(['day', 'week', 'month'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRange === range 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            Visitor Trends
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
            Most Watched Genres
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
              <div className="w-full text-center text-muted-foreground">No genre data yet</div>
            )}
          </div>
        </GlassPanel>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Countries */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Top Countries
          </h3>
          {topCountries && topCountries.length > 0 ? (
            <div className="space-y-3">
              {topCountries.map((country, index) => (
                <div key={country.name} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {index + 1}
                  </div>
                  <span className="flex-1 font-medium">{country.name}</span>
                  <div className="flex-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(country.value / (topCountries[0]?.value || 1)) * 100}%` }}
                        className="h-full bg-primary rounded-full"
                      />
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground w-20 text-right">
                    {country.value} visitors
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No country data yet</div>
          )}
        </GlassPanel>

        {/* Hourly Activity */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Today's Activity
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyActivity || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={3} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar 
                  dataKey="visits" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]}
                  name="Page Visits"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      </div>

      {/* Watch Time Chart */}
      <GlassPanel className="p-6">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <Play className="w-4 h-4 text-primary" />
          Daily Watch Time (minutes)
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyStats || []}>
              <defs>
                <linearGradient id="watchTimeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
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
                dataKey="watchTime"
                stroke="#8b5cf6"
                fill="url(#watchTimeGrad)"
                strokeWidth={2}
                name="Watch Time (min)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassPanel>
    </div>
  );
}
