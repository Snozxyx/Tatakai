// Admin Dashboard Overhaul — shared TypeScript type definitions
// Covers: Update Management, Crash Reports, User Stats, Extension Analytics,
//         Streaming & Download Analytics, Performance Insights, and Ban System

// ---------------------------------------------------------------------------
// 1. Update Management
// ---------------------------------------------------------------------------

export interface UpdatePolicy {
  id: string;
  channel: 'stable' | 'beta' | 'experimental';
  type: 'mandatory' | 'recommended' | 'experimental' | 'rollback';
  target_version: string;            // semver \d+\.\d+\.\d+
  rollback_from_version?: string;
  active: boolean;
  notes?: string;
  published_at: string;              // ISO 8601
}

export interface CreatePolicyForm {
  channel: UpdatePolicy['channel'];
  type: UpdatePolicy['type'];
  target_version: string;
  rollback_from_version?: string;
  notes?: string;
}

/** Human-readable labels for each Electron auto-updater status string. */
export const UPDATE_STATUS_LABELS: Record<string, string> = {
  checking: 'Checking…',
  available: 'Update available',
  'not-available': 'Up to date',
  downloading: 'Downloading…',
  downloaded: 'Ready to install',
  'mandatory-update': 'Mandatory update required',
  error: 'Check failed',
};

// ---------------------------------------------------------------------------
// 2. Crash Reports
// ---------------------------------------------------------------------------

export interface CrashReport {
  id: string;
  date: string;   // ISO 8601 timestamp from crash service
  path: string;   // path to crash dump file
}

// ---------------------------------------------------------------------------
// 3. User Statistics
// ---------------------------------------------------------------------------

export type TimeRange = 'day' | 'week' | 'month';

export interface SignupGroup {
  date: string;
  count: number;
}

export interface DauPoint {
  date: string;
  dau: number;
}

export interface CountrySignup {
  country: string;
  count: number;
}

export interface UserStatsData {
  totalCount: number;
  signupGroups: SignupGroup[];
  dauSeries: DauPoint[];
  retentionPercent: number;        // fixed trailing 30-day cohort
  topCountries: CountrySignup[];
}

// ---------------------------------------------------------------------------
// 4. Extension Analytics
// ---------------------------------------------------------------------------

export interface ExtensionMetrics {
  id: string;
  name: string;
  totalInstalls: number;
  activeUsers: number;             // proxy: approved extensions minus uninstalled
  recentInstalls: number;          // installs in last 30 days
  healthScore: number;
  uninstallRate: number | null;    // null when totalInstalls === 0
}

// ---------------------------------------------------------------------------
// 5. Streaming & Download Analytics
// ---------------------------------------------------------------------------

export interface StreamingMetrics {
  totalSessions: number;
  peakConcurrent: number;          // max count in any 1-hour bucket
  durationBuckets: { label: string; count: number }[];
  providerBreakdown: { provider: string; count: number }[];
}

export interface DownloadMetrics {
  topContent: { content_id: string; title?: string; completedCount: number }[];
  completionRate: number | null;   // null when denominator = 0
}

// ---------------------------------------------------------------------------
// 6. Performance Insights
// ---------------------------------------------------------------------------

export interface VersionDistribution {
  version: string;
  percent: number;
  count: number;
}

export interface PerfSnapshot {
  timestamp: number;
  heapUsedMB: number;
  rssMB: number;
}

export interface PerformanceInsightsData {
  versionDistribution: VersionDistribution[];
  adoptionRate: number | null;     // null when no active stable policy
  crashRateSeries: { date: string; count: number }[];
  perfSnapshots: PerfSnapshot[];   // from IPC, empty when window.electron undefined
}

// ---------------------------------------------------------------------------
// 7. Ban System Extensions
// ---------------------------------------------------------------------------

export interface BanDialogState {
  userId: string;
  durationType: 'permanent' | '7d' | '30d' | 'custom';
  customHours?: number;            // 1–8760
  reason: string;
  templateId?: string;
}

export interface DeviceBan {
  id: string;
  device_id: string;               // 1–255 chars
  reason: string;                  // 1–500 chars
  banned_by: string;               // admin user_id
  created_at: string;
  expires_at?: string | null;
}

export interface IpBan {
  id: string;
  ip_address: string;              // IPv4 or IPv6
  reason: string;                  // 1–500 chars
  banned_by: string;
  created_at: string;
  expires_at?: string | null;
}

export interface BanTemplate {
  id: string;
  name: string;                    // 1–100 chars, unique
  reason: string;
  duration_hours: number | null;   // null = permanent
  created_by: string;
  created_at: string;
}

export interface BanAuditRecord {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  action: 'banned' | 'unbanned';
  reason: string;
  duration_hours: number | null;
  expires_at: string | null;
  performed_by_display_name: string;
  timestamp: string;
}
