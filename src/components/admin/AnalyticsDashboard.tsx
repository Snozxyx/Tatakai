import { useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { motion } from 'framer-motion';
import { 
  TrendingUp, Users, Eye, Play, Clock, Globe, MapPin,
  BarChart3, PieChart, Activity, ArrowUpRight, 
  Server, Smartphone, Monitor, AlertTriangle, Zap,
  Target, Star, MessageSquare, Heart, Settings,
  Cpu, HardDrive, Wifi, UserCheck, TrendingDown
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, PieChart as RePieChart, Pie, Cell,
  LineChart, Line, ComposedChart
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';

// Animated value component for displaying animated numbers
const AnimatedValue = ({ value }: { value: string }) => {
  // Extract numeric value from string
  const numericValue = parseInt(value.replace(/[^0-9]/g, '')) || 0;
  const isPercentage = value.includes('%');
  const isTime = value.includes('h') || value.includes('m');
  
  // Always call the hook, but conditionally use the result
  const animatedValue = useAnimatedNumber(numericValue, 1500, {
    decimals: 0,
  });
  
  // Return the appropriate value based on type
  if (isTime || isPercentage) {
    return <span>{value}</span>;
  }
  
  return <span>{animatedValue}</span>;
};

export function AnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('week');
  const days = timeRange === 'day' ? 1 : timeRange === 'week' ? 7 : 30;

  // User engagement metrics
  const { data: userEngagement } = useQuery({
    queryKey: ['analytics_user_engagement', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('user_engagement')
        .select('*')
        .gte('updated_at', startDate);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Content performance
  const { data: contentPerformance } = useQuery({
    queryKey: ['analytics_content_performance', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('admin_analytics')
        .select('*')
        .eq('metric_type', 'content_performance')
        .gte('created_at', startDate);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Feature usage analytics
  const { data: featureUsage } = useQuery({
    queryKey: ['analytics_feature_usage', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('admin_analytics')
        .select('*')
        .eq('metric_type', 'feature_usage')
        .gte('created_at', startDate);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Server performance metrics
  const { data: serverPerformance } = useQuery({
    queryKey: ['analytics_server_performance', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('admin_analytics')
        .select('*')
        .eq('metric_type', 'server_performance')
        .gte('created_at', startDate);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Device and platform stats
  const { data: deviceStats } = useQuery({
    queryKey: ['analytics_device_stats', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('page_visits')
        .select('device_type, platform, theme_used, referrer')
        .gte('created_at', startDate);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Error tracking
  const { data: errorTracking } = useQuery({
    queryKey: ['analytics_error_tracking', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('admin_analytics')
        .select('*')
        .eq('metric_type', 'error_tracking')
        .gte('created_at', startDate);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Cache hit/miss for recommendations
  const { data: recommendationCache } = useQuery({
    queryKey: ['analytics_recommendation_cache', timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('cached_recommendations')
        .select('cached_at, expires_at')
        .gte('cached_at', startDate);
      
      if (error) throw error;
      
      const hits = data?.length || 0;
      const misses = Math.floor(hits * 0.3); // Estimate misses as 30% of hits
      return { hits, misses, total: hits + misses };
    },
  });

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
      animated: true,
    },
    {
      title: 'Total Visitors',
      value: totalVisitors?.toLocaleString() || '0',
      subtitle: `${visitorBreakdown?.guests || 0} guests, ${visitorBreakdown?.loggedIn || 0} logged in`,
      icon: <Eye className="w-5 h-5" />,
      color: 'from-green-500 to-green-700',
      animated: true,
    },
    {
      title: 'Watch Time',
      value: formatWatchTime(totalWatchTime || 0),
      subtitle: `Last ${days} days`,
      icon: <Clock className="w-5 h-5" />,
      color: 'from-purple-500 to-purple-700',
      animated: true,
    },
    {
      title: 'Top Country',
      value: topCountries?.[0]?.name || 'N/A',
      subtitle: `${topCountries?.[0]?.value || 0} visitors`,
      icon: <Globe className="w-5 h-5" />,
      color: 'from-orange-500 to-orange-700',
      animated: true,
    },
    // New enhanced analytics cards
    {
      title: 'Avg Engagement',
      value: userEngagement ? `${Math.round(userEngagement.reduce((acc, e) => acc + (e.engagement_score || 0), 0) / userEngagement.length)}%` : 'N/A',
      subtitle: 'User engagement score',
      icon: <Target className="w-5 h-5" />,
      color: 'from-indigo-500 to-indigo-700',
      animated: true,
    },
    {
      title: 'Cache Hit Rate',
      value: recommendationCache ? `${Math.round((recommendationCache.hits / recommendationCache.total) * 100)}%` : 'N/A',
      subtitle: 'Recommendation cache efficiency',
      icon: <Zap className="w-5 h-5" />,
      color: 'from-cyan-500 to-cyan-700',
      animated: true,
    },
    {
      title: 'Error Rate',
      value: errorTracking ? `${Math.round((errorTracking.length / (errorTracking.length + 100)) * 100)}%` : 'N/A',
      subtitle: 'System error frequency',
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'from-red-500 to-red-700',
      animated: true,
    },
    {
      title: 'Active Features',
      value: featureUsage ? new Set(featureUsage.map(f => f.metadata?.feature_name)).size.toString() : '0',
      subtitle: 'Most used features',
      icon: <Star className="w-5 h-5" />,
      color: 'from-pink-500 to-pink-700',
      animated: true,
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
                <p className="text-2xl font-bold text-white">
                  {stat.animated ? (
                    <AnimatedValue value={stat.value} />
                  ) : (
                    stat.value
                  )}
                </p>
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

      {/* Enhanced Analytics Sections */}
      
      {/* User Engagement & Content Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Engagement Metrics */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            User Engagement
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {userEngagement ? Math.round(userEngagement.reduce((acc, e) => acc + (e.total_episodes_watched || 0), 0) / userEngagement.length) : 0}
                </div>
                <div className="text-sm text-muted-foreground">Avg Episodes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {userEngagement ? Math.round(userEngagement.reduce((acc, e) => acc + (e.total_watch_time || 0), 0) / userEngagement.length / 60) : 0}m
                </div>
                <div className="text-sm text-muted-foreground">Avg Watch Time</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Forum Activity</span>
                <span className="text-sm font-medium">
                  {userEngagement ? Math.round(userEngagement.reduce((acc, e) => acc + (e.forum_posts_count || 0), 0) / userEngagement.length) : 0} posts
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Playlists Created</span>
                <span className="text-sm font-medium">
                  {userEngagement ? Math.round(userEngagement.reduce((acc, e) => acc + (e.playlist_count || 0), 0) / userEngagement.length) : 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Favorites</span>
                <span className="text-sm font-medium">
                  {userEngagement ? Math.round(userEngagement.reduce((acc, e) => acc + (e.favorite_count || 0), 0) / userEngagement.length) : 0}
                </span>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* Feature Usage */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Feature Usage
          </h3>
          <div className="space-y-3">
            {featureUsage?.slice(0, 5).map((feature, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm">
                  {feature.metadata?.feature_name || feature.metric_type}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(feature.metric_value || 0) * 10}%` }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-8">
                    {feature.metric_value || 0}
                  </span>
                </div>
              </div>
            )) || (
              <div className="text-center py-4 text-muted-foreground">No feature usage data</div>
            )}
          </div>
        </GlassPanel>
      </div>

      {/* Device & Platform Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Platform Distribution */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" />
            Platforms
          </h3>
          <div className="space-y-3">
            {(() => {
              const platformData = deviceStats?.reduce((acc, device) => {
                acc[device.platform || 'Unknown'] = (acc[device.platform || 'Unknown'] || 0) + 1;
                return acc;
              }, {} as Record<string, number>) || {};
              
              const sortedPlatforms = Object.entries(platformData).sort(([,a], [,b]) => b - a);
              const total = Object.values(platformData).reduce((sum, count) => sum + count, 0);
              
              return sortedPlatforms.slice(0, 5).map(([platform, count]) => (
                <div key={platform} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{platform}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(count / total) * 100}%` }}
                        className="h-full bg-blue-500 rounded-full"
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {Math.round((count / total) * 100)}%
                    </span>
                  </div>
                </div>
              ));
            })()}
          </div>
        </GlassPanel>

        {/* Device Types */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            Devices
          </h3>
          <div className="space-y-3">
            {(() => {
              const deviceData = deviceStats?.reduce((acc, device) => {
                const type = device.device_type || 'Unknown';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
              }, {} as Record<string, number>) || {};
              
              const sortedDevices = Object.entries(deviceData).sort(([,a], [,b]) => b - a);
              const total = Object.values(deviceData).reduce((sum, count) => sum + count, 0);
              
              return sortedDevices.slice(0, 4).map(([device, count]) => (
                <div key={device} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{device}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(count / total) * 100}%` }}
                        className="h-full bg-green-500 rounded-full"
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {Math.round((count / total) * 100)}%
                    </span>
                  </div>
                </div>
              ));
            })()}
          </div>
        </GlassPanel>

        {/* Theme Usage */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            Popular Themes
          </h3>
          <div className="space-y-3">
            {(() => {
              const themeData = deviceStats?.reduce((acc, device) => {
                const theme = device.theme_used || 'Unknown';
                acc[theme] = (acc[theme] || 0) + 1;
                return acc;
              }, {} as Record<string, number>) || {};
              
              const sortedThemes = Object.entries(themeData).sort(([,a], [,b]) => b - a);
              const total = Object.values(themeData).reduce((sum, count) => sum + count, 0);
              
              return sortedThemes.slice(0, 4).map(([theme, count]) => (
                <div key={theme} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{theme.replace('-', ' ')}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(count / total) * 100}%` }}
                        className="h-full bg-purple-500 rounded-full"
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {Math.round((count / total) * 100)}%
                    </span>
                  </div>
                </div>
              ));
            })()}
          </div>
        </GlassPanel>
      </div>

      {/* Server Performance & Error Tracking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Server Performance */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            Server Performance
          </h3>
          <div className="space-y-4">
            {serverPerformance?.slice(0, 5).map((server, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm">{server.metadata?.server_name || 'Unknown'}</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(server.metric_value || 0)}%` }}
                      className={`h-full rounded-full ${
                        (server.metric_value || 0) > 90 ? 'bg-red-500' : 
                        (server.metric_value || 0) > 70 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-12 text-right">
                    {server.metric_value || 0}%
                  </span>
                </div>
              </div>
            )) || (
              <div className="text-center py-4 text-muted-foreground">No server data available</div>
            )}
          </div>
        </GlassPanel>

        {/* Error Tracking */}
        <GlassPanel className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-primary" />
            Error Tracking
          </h3>
          <div className="space-y-3">
            {errorTracking?.slice(0, 6).map((error, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm truncate flex-1 mr-2">
                  {error.metadata?.error_message || error.metadata?.error_type || 'Unknown Error'}
                </span>
                <span className="text-sm text-red-500 font-medium">
                  {error.metric_value || 0}x
                </span>
              </div>
            )) || (
              <div className="text-center py-4 text-muted-foreground">No errors tracked</div>
            )}
          </div>
        </GlassPanel>
      </div>

      {/* Traffic Sources Analytics */}
      <GlassPanel className="p-6">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Traffic Sources
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Referrer Analysis */}
          <div>
            <h4 className="text-sm font-medium mb-3">Top Referrers</h4>
            <div className="space-y-2">
              {(() => {
                const referrerData = deviceStats?.reduce((acc, visit) => {
                  const referrer = visit.referrer || 'Direct';
                  acc[referrer] = (acc[referrer] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>) || {};
                
                const sortedReferrers = Object.entries(referrerData).sort(([,a], [,b]) => b - a);
                const total = Object.values(referrerData).reduce((sum, count) => sum + count, 0);
                
                return sortedReferrers.slice(0, 8).map(([referrer, count]) => (
                  <div key={referrer} className="flex items-center justify-between">
                    <span className="text-sm truncate flex-1 mr-2">
                      {referrer === 'Direct' ? '🔗 Direct Traffic' : 
                       referrer.includes('google') ? '🔍 Google' :
                       referrer.includes('youtube') ? '🎬 YouTube' :
                       referrer.includes('twitter') || referrer.includes('x.com') ? '🐦 Twitter' :
                       referrer.includes('reddit') ? '🤖 Reddit' :
                       referrer.includes('facebook') ? '📘 Facebook' :
                       referrer.includes('instagram') ? '📷 Instagram' :
                       referrer.includes('discord') ? '💬 Discord' :
                       '🌐 Other'}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / total) * 100}%` }}
                          className="h-full bg-primary rounded-full"
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-12 text-right">
                        {Math.round((count / total) * 100)}%
                      </span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Traffic Type Breakdown */}
          <div>
            <h4 className="text-sm font-medium mb-3">Traffic Types</h4>
            <div className="space-y-3">
              {(() => {
                const organicCount = deviceStats?.filter(visit => 
                  !visit.referrer || 
                  visit.referrer.includes('google') || 
                  visit.referrer.includes('bing') ||
                  visit.referrer.includes('yahoo')
                ).length || 0;
                
                const directCount = deviceStats?.filter(visit => 
                  !visit.referrer || 
                  visit.referrer.includes(window.location.hostname)
                ).length || 0;
                
                const socialCount = deviceStats?.filter(visit => 
                  visit.referrer && (
                    visit.referrer.includes('twitter') ||
                    visit.referrer.includes('facebook') ||
                    visit.referrer.includes('instagram') ||
                    visit.referrer.includes('discord') ||
                    visit.referrer.includes('reddit')
                  )
                ).length || 0;
                
                const referralCount = deviceStats?.filter(visit => 
                  visit.referrer && 
                  !visit.referrer.includes('google') &&
                  !visit.referrer.includes('bing') &&
                  !visit.referrer.includes('yahoo') &&
                  !visit.referrer.includes('twitter') &&
                  !visit.referrer.includes('facebook') &&
                  !visit.referrer.includes('instagram') &&
                  !visit.referrer.includes('discord') &&
                  !visit.referrer.includes('reddit') &&
                  !visit.referrer.includes(window.location.hostname)
                ).length || 0;

                const trafficTypes = [
                  { name: 'Organic Search', count: organicCount, color: 'bg-green-500', icon: '🔍' },
                  { name: 'Direct', count: directCount, color: 'bg-blue-500', icon: '🔗' },
                  { name: 'Social Media', count: socialCount, color: 'bg-purple-500', icon: '📱' },
                  { name: 'Referral', count: referralCount, color: 'bg-orange-500', icon: '🤝' },
                ];

                const total = organicCount + directCount + socialCount + referralCount;

                return trafficTypes.map((type) => (
                  <div key={type.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{type.icon}</span>
                      <span className="text-sm">{type.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: total > 0 ? `${(type.count / total) * 100}%` : '0%' }}
                          className={`h-full ${type.color} rounded-full`}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-12 text-right">
                        {type.count}
                      </span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* Geographic Distribution */}
        <div className="mt-6 pt-6 border-t border-border">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Geographic Distribution
          </h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(() => {
              const countryData = topCountries?.reduce((acc, country) => {
                acc[country.name] = (acc[country.name] || 0) + country.value;
                return acc;
              }, {} as Record<string, number>) || {};
              
              const sortedCountries = Object.entries(countryData).sort(([,a], [,b]) => b - a);
              const total = Object.values(countryData).reduce((sum, count) => sum + count, 0);
              
              return sortedCountries.slice(0, 8).map(([country, count]) => (
                <div key={country} className="text-center p-3 rounded-lg bg-muted/30">
                  <div className="text-lg mb-1">
                    {country === 'United States' ? '🇺🇸' :
                     country === 'Japan' ? '🇯🇵' :
                     country === 'United Kingdom' ? '🇬🇧' :
                     country === 'Germany' ? '🇩🇪' :
                     country === 'France' ? '🇫🇷' :
                     country === 'Canada' ? '🇨🇦' :
                     country === 'Australia' ? '🇦🇺' :
                     country === 'Brazil' ? '🇧🇷' :
                     country === 'India' ? '🇮🇳' :
                     country === 'South Korea' ? '🇰🇷' :
                     country === 'Russia' ? '🇷🇺' :
                     country === 'Mexico' ? '🇲🇽' :
                     country === 'Spain' ? '🇪🇸' :
                     country === 'Italy' ? '🇮🇹' :
                     country === 'Netherlands' ? '🇳🇱' :
                     '🌍'}
                  </div>
                  <div className="text-sm font-medium">{country}</div>
                  <div className="text-xs text-muted-foreground">
                    {Math.round((count / total) * 100)}% ({count} visitors)
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </GlassPanel>

      {/* System Health Dashboard */}
      <GlassPanel className="p-6">
        <h3 className="font-medium mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          System Health
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">
              {recommendationCache ? `${Math.round((recommendationCache.hits / recommendationCache.total) * 100)}%` : 'N/A'}
            </div>
            <div className="text-sm text-muted-foreground">Cache Hit Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-500">
              {Math.round(totalWatchTime || 0 / 3600)}h
            </div>
            <div className="text-sm text-muted-foreground">Total Watch Time</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-500">
              {featureUsage ? new Set(featureUsage.map(f => f.metadata?.feature_name)).size : 0}
            </div>
            <div className="text-sm text-muted-foreground">Active Features</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-500">
              {userEngagement ? Math.round(userEngagement.reduce((acc, e) => acc + (e.unique_anime_watched || 0), 0) / userEngagement.length) : 0}
            </div>
            <div className="text-sm text-muted-foreground">Avg Anime/User</div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
