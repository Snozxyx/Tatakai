import { supabase } from '@/integrations/supabase/client';
import { requestWithDeadline } from './requestDeadline';

export interface DashboardStats {
  totalUsers: number; totalVisitors: number; totalWatchTime: number;
  visitorBreakdown: {guests:number;loggedIn:number};
  topCountries: {name:string;value:number}[]; unknownCountrySessions:number;
  topGenres: {name:string;value:number}[];
  dailyStats: {date:string;visitors:number;dau:number;watchTime:number;newUsers:number;retention:number}[];
  hourlyActivity:{hour:string;visits:number}[];
  referrerChannels:{name:string;value:number}[];
  topReferrers:{host:string;sessions:number}[]; topPages:{path:string;sessions:number}[];
  todayBreakdown:{members:number;guests:number;total:number};
  sessionQuality:{totalSessions:number;totalPageViews:number;returningSessions:number;returningRate:number;avgPagesPerSession:number;avgWatchMinutes:number};
  funnel:{visitors:number;signups:number;activated:number;retained:number;loggedInUsers:number;signupRate:number;activationRate:number;retentionRate:number;bounceRate:number};
}

export async function fetchAdminAnalytics<T>(name: string, days: number, signal?: AbortSignal): Promise<T> {
  const result = await requestWithDeadline(abort => supabase.rpc(name as any, {p_days:days}).abortSignal(abort),signal);
  if (result.error) throw result.error;
  return result.data as T;
}
