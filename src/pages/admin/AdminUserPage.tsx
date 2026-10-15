import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format, formatDistanceToNow } from '@/lib/localeFormat';
import {
  ArrowLeft, Ban, ShieldCheck, ShieldOff, Loader2, MonitorSmartphone,
  Globe, Clock, MessageSquare, FileText, Activity, LogOut, ShieldQuestion,
  Shield, Smartphone, Wifi, HardDrive, Trash2, Music2, Layers,
} from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { BanUserDialog } from '@/components/moderation/BanUserDialog';
import { AdminUserTabs } from '@/components/admin/AdminUserTabs';
import { deriveIsAdmin, deriveIsModerator } from '@/lib/roles';
import { useAuth } from '@/contexts/AuthContext';
import { formatBytes } from '@/components/extensions/store/extensionVisuals';
import { toast } from 'sonner';
import {
  useAdminUserProfile,
  useUserSessions,
  useUserActivityCounts,
  useUnbanUser,
  useSetPrivilege,
  useRevokeSession,
  useRevokeAllSessions,
  useSetStaffRole,
  useSetStorageQuota,
  useBanDevice,
  useBanIp,
  useBanUserDevices,
  useBanUserIps,
  useDeleteUserContent,
  type Privilege,
  type DeleteScope,
} from '@/hooks/moderation/useModeration';
const PRIVILEGES: { key: Privilege; label: string; hint: string }[] = [
  { key: 'can_comment', get label() { return uiI18n.t('app.comment_153d7a58'); }, hint: 'Post comments anywhere' },
  { key: 'can_post', get label() { return uiI18n.t('app.post_7858ac3f'); }, hint: 'Create forum / community posts' },
  { key: 'can_tierlist', get label() { return uiI18n.t('app.tier_lists_bfe1b707'); }, hint: 'Create tier lists' },
  { key: 'can_upload', get label() { return uiI18n.t('app.upload_8bdf057f'); }, hint: 'Upload to user media' },
  { key: 'can_access_community', get label() { return uiI18n.t('app.community_bfd58ee3'); }, hint: 'Access community features' },
];

function fmtWatch(seconds: number | null): string {
  const s = seconds ?? 0;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `${h.toLocaleString(uiI18n.language)}h`;
  return `${Math.floor(s / 60)}m`;
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  useUiTranslation();
  return (
    <GlassPanel className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </GlassPanel>
  );
}

export default function AdminUserPage() {
  useUiTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Viewer's own staff status (this route is admin-guarded; the delete RPC is
  // is_staff-gated server-side). Panels below gate on the VIEWER, never on the
  // target profile — otherwise they'd only show when viewing another staff user.
  const { isAdmin: viewerIsAdmin, isModerator: viewerIsModerator } = useAuth();

  const { data: profile, isLoading, isError } = useAdminUserProfile(userId);
  const { data: sessions = [] } = useUserSessions(userId);
  const { data: activity } = useUserActivityCounts(userId);
  const unban = useUnbanUser();
  const setPriv = useSetPrivilege();
  const revokeSession = useRevokeSession();
  const revokeAll = useRevokeAllSessions();
  const setStaffRole = useSetStaffRole();
  const banDevice = useBanDevice();
  const banIp = useBanIp();
  const banAllDevices = useBanUserDevices();
  const banAllIps = useBanUserIps();
  const setQuota = useSetStorageQuota();
  const deleteContent = useDeleteUserContent();

  const [banOpen, setBanOpen] = useState(false);
  const [quotaMb, setQuotaMb] = useState('');

  if (!userId) return <div className="p-8">{uiI18n.t('app.invalid_user_id_62e0a164')}</div>;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Button variant="ghost" onClick={() => navigate('/admin')} className="mb-6 gap-2">
          <ArrowLeft className="h-4 w-4" /> {uiI18n.t('app.admin_4e7afebc')}
        </Button>
        <GlassPanel className="p-12 text-center">
          <ShieldQuestion className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{uiI18n.t('app.user_not_found_or_profile_is_inaccessible_6d0913c3')}</p>
        </GlassPanel>
      </div>
    );
  }

  const name = profile.display_name || profile.username || 'User';
  const roleLabel = profile.is_admin ? uiI18n.t('app.admin_4e7afebc') : profile.is_moderator ? uiI18n.t('app.moderator_ad3b15c3') : (profile.role || uiI18n.t('app.user_12dea96f'));
  // last_login_at comes from the unapplied user_sessions migration; last_seen (applied,
  // heartbeat-updated) is the live fallback.
  const lastLogin = profile.last_login_at ?? (profile as any).last_seen ?? null;

  const togglePriv = async (key: Privilege, enabled: boolean) => {
    try {
      await setPriv.mutateAsync({ userId, privilege: key, enabled });
      toast.success(uiI18n.t('app.i18n_value_0_i18n_value_1_84b81eb1', { value0: enabled ? 'Enabled' : 'Disabled', value1: key.replace('can_', '') }));
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
    }
  };

  const handleUnban = async () => {
    if (!(await confirm({ get title() { return uiI18n.t('app.unban_i18n_value_0_7ac5ba55', { value0: name }); } }))) return;
    try {
      await unban.mutateAsync(userId);
      toast.success(uiI18n.t('app.user_unbanned_62e730a8'));
    } catch (err: any) {
      toast.error('Failed to unban: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
    }
  };

  const handleRevokeAll = async () => {
    if (!(await confirm({ get title() { return uiI18n.t('app.revoke_all_sessions_a44563fc'); }, get description() { return uiI18n.t('app.the_user_will_be_signed_out_on_every_device_178d5e46'); }, destructive: true }))) return;
    try {
      const n = await revokeAll.mutateAsync(userId);
      toast.success(`Revoked ${n ?? ''} session(s)`.trim());
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
    }
  };

  const activeSessions = sessions.filter((s) => !s.revoked_at);

  const isAdmin = deriveIsAdmin(profile);
  const isModerator = deriveIsModerator(profile);

  const toggleRole = async (role: 'admin' | 'moderator', enabled: boolean) => {
    if (!(await confirm({
      get title() { return uiI18n.t('app.i18n_value_0_i18n_value_1_for_i18n_value_2_26d18d72', { value0: enabled ? 'Grant' : 'Revoke', value1: role, value2: name }); },
      destructive: !enabled,
    }))) return;
    try {
      await setStaffRole.mutateAsync({ userId, role, enabled });
      toast.success(uiI18n.t('app.i18n_value_0_i18n_value_1_84b81eb1', { value0: enabled ? 'Granted' : 'Revoked', value1: role }));
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
    }
  };

  const handleBanAllDevices = async () => {
    if (!(await confirm({ get title() { return uiI18n.t('app.ban_all_devices_0bf9e50d'); }, get description() { return uiI18n.t('app.every_device_id_linked_to_this_user_is_blocked_c1759b7c'); }, destructive: true }))) return;
    try {
      const n = await banAllDevices.mutateAsync({ userId });
      toast.success(uiI18n.t('app.banned_i18n_value_0_device_s_17a3990c', { value0: n }));
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
    }
  };

  const handleBanAllIps = async () => {
    if (!(await confirm({ get title() { return uiI18n.t('app.ban_all_ips_9bde48f1'); }, get description() { return uiI18n.t('app.every_ip_known_for_this_user_is_blocked_0c53eec1'); }, destructive: true }))) return;
    try {
      const n = await banAllIps.mutateAsync({ userId });
      toast.success(uiI18n.t('app.banned_i18n_value_0_ip_s_0b7e6604', { value0: n }));
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
    }
  };

  const handleBanDevice = async (deviceId: string | null | undefined) => {
    if (!deviceId) { toast.error(uiI18n.t('app.no_device_id_on_this_session_9ada3b95')); return; }
    if (!(await confirm({ get title() { return uiI18n.t('app.ban_this_device_ebb65481'); }, destructive: true }))) return;
    try {
      await banDevice.mutateAsync({ deviceId, targetUserId: userId });
      toast.success(uiI18n.t('app.device_banned_46b880f1'));
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
    }
  };

  const handleBanIp = async (ip: string | null | undefined) => {
    if (!ip) { toast.error(uiI18n.t('app.no_ip_on_this_session_84f71fdb')); return; }
    if (!(await confirm({ get title() { return uiI18n.t('app.ban_this_ip_70af4473'); }, destructive: true }))) return;
    try {
      await banIp.mutateAsync({ ip, targetUserId: userId });
      toast.success(uiI18n.t('app.ip_banned_100a008a'));
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
    }
  };

  // Storage/upload quota (admin-only control). Source of truth = profiles
  // storage columns from 20260925000100 (unapplied); 25 MB default meanwhile.
  const DEFAULT_QUOTA_BYTES = 26214400;
  const quotaBytes = profile.storage_quota_bytes ?? DEFAULT_QUOTA_BYTES;
  const usedBytes = profile.storage_used_bytes ?? 0;
  const usedPct = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

  const handleSetQuota = async () => {
    const mb = parseFloat(quotaMb);
    if (!Number.isFinite(mb) || mb < 0) { toast.error(uiI18n.t('app.enter_a_valid_size_in_mb_20d5f8c1')); return; }
    try {
      await setQuota.mutateAsync({ userId, bytes: Math.round(mb * 1024 * 1024) });
      toast.success(uiI18n.t('app.upload_limit_set_to_i18n_value_0_mb_41d3f8f2', { value0: mb }));
      setQuotaMb('');
    } catch (err: any) {
      toast.error('Failed to set limit: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
    }
  };

  const isStaff = viewerIsAdmin || viewerIsModerator;

  const handleDeleteContent = async (scope: DeleteScope) => {
    const label: Record<DeleteScope, string> = {
      comments: 'all comments',
      posts: 'all forum / community posts',
      playlists: 'all playlists',
      tierlists: 'all tier lists',
      all: 'ALL content (comments, posts, playlists and tier lists)',
    };
    if (!(await confirm({
      get title() { return uiI18n.t('app.delete_i18n_value_0_by_i18n_value_1_40d97f5d', { value0: label[scope], value1: name }); },
      get description() { return uiI18n.t('app.comments_and_posts_are_removed_but_their_thread__dff60725'); },
      confirmLabel: 'Delete',
      destructive: true,
    }))) return;
    try {
      const r = await deleteContent.mutateAsync({ userId, scope });
      const parts: string[] = [];
      if (r.comments) parts.push(`${r.comments} comment(s)`);
      if (r.posts) parts.push(`${r.posts} post(s)`);
      if (r.playlists) parts.push(`${r.playlists} playlist(s)`);
      if (r.tierlists) parts.push(`${r.tierlists} tier list(s)`);
      toast.success(parts.length ? uiI18n.t('app.deleted_i18n_value_0_36aef7b8', { value0: parts.join(', ') }) : uiI18n.t('app.nothing_to_delete_c6bc9a32'));
    } catch (err: any) {
      toast.error('Failed to delete: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => navigate('/admin')} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> {uiI18n.t('app.admin_4e7afebc')}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isModerator ? 'secondary' : 'outline'}
            size="sm"
            disabled={setStaffRole.isPending || isAdmin}
            onClick={() => toggleRole('moderator', !isModerator)}
            className="gap-2"
            title={isAdmin ? uiI18n.t('app.admins_are_always_moderators_1a7501c9') : undefined}
          >
            <ShieldCheck className="h-4 w-4" /> {isModerator ? uiI18n.t('app.moderator_ad3b15c3') : uiI18n.t('app.make_moderator_b91e0210')}
          </Button>
          <Button
            variant={isAdmin ? 'secondary' : 'outline'}
            size="sm"
            disabled={setStaffRole.isPending}
            onClick={() => toggleRole('admin', !isAdmin)}
            className="gap-2"
          >
            <Shield className="h-4 w-4" /> {isAdmin ? uiI18n.t('app.admin_4e7afebc') : uiI18n.t('app.make_admin_84ec1c9a')}
          </Button>
          {profile.is_banned ? (
            <Button variant="outline" onClick={handleUnban} disabled={unban.isPending} className="gap-2">
              {unban.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              {uiI18n.t('app.unban_d2671bfb')}
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setBanOpen(true)} className="gap-2">
              <Ban className="h-4 w-4" /> {uiI18n.t('app.ban_user_f1476b41')}
            </Button>
          )}
        </div>
      </div>

      {/* Identity header */}
      <GlassPanel className="mb-6 p-6">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar className="h-20 w-20 ring-2 ring-white/10">
            <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
            <AvatarFallback className="bg-gradient-to-br from-primary/60 to-secondary/60 text-xl font-bold">
              {name[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{name}</h1>
              <Badge variant={profile.is_admin || profile.is_moderator ? 'default' : 'secondary'} className="gap-1">
                <ShieldCheck className="h-3 w-3" /> {roleLabel}
              </Badge>
              {profile.is_banned && <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> {uiI18n.t('app.banned_c8cd83f6')}</Badge>}
            </div>
            {profile.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
            <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground/60">{profile.user_id}</p>
            {profile.is_banned && profile.ban_reason && (
              <p className="mt-2 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {uiI18n.t('app.ban_reason_717064a3')} {profile.ban_reason}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/5 pt-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{uiI18n.t('app.joined_43a1c626')}</p>
            <p className="font-medium">{profile.created_at ? format(new Date(profile.created_at), 'PP') : '—'}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground"><Clock className="h-3 w-3" /> {uiI18n.t('app.last_login_43dab84f')}</p>
            <p className="font-medium">{lastLogin ? formatDistanceToNow(new Date(lastLogin), { addSuffix: true }) : '—'}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground"><MonitorSmartphone className="h-3 w-3" /> {uiI18n.t('app.device_a5a74a6d')}</p>
            <p className="truncate font-medium">{profile.device_name ?? (profile as any).device_id ?? '—'}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground"><Globe className="h-3 w-3" /> {uiI18n.t('app.country_d523ebbd')}</p>
            <p className="font-medium">{profile.country || '—'}</p>
          </div>
        </div>
      </GlassPanel>

      {/* Activity */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={MessageSquare} label={uiI18n.t('app.comments_fce06e20')} value={(activity?.comments ?? 0).toLocaleString(uiI18n.language)} />
        <StatCard icon={FileText} label={uiI18n.t('app.posts_a0ca0c31')} value={(activity?.posts ?? 0).toLocaleString(uiI18n.language)} />
        <StatCard icon={Activity} label={uiI18n.t('app.visits_30d_7eff225e')} value={(activity?.visits30d ?? 0).toLocaleString(uiI18n.language)} />
        <StatCard icon={Clock} label={uiI18n.t('app.watch_time_200564a6')} value={fmtWatch(profile.total_watch_time_seconds)} />
      </div>

      {/* Privileges */}
      <GlassPanel className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-semibold">{uiI18n.t('app.privileges_de3a5e76')}</h2>
        <div className="space-y-1">
          {PRIVILEGES.map(({ key, label, hint }) => (
            <div key={key} className="flex items-center justify-between rounded-lg px-2 py-2.5 hover:bg-white/[0.03]">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
              <Switch
                checked={profile[key]}
                disabled={setPriv.isPending}
                onCheckedChange={(v) => togglePriv(key, v)}
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground/70">{uiI18n.t('app.turning_a_privilege_off_blocks_the_action_at_the_86e17cba')}</p>
      </GlassPanel>

      {/* Upload limit — admin only */}
      {viewerIsAdmin && (
        <GlassPanel className="mb-6 p-6">
          <div className="mb-4 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{uiI18n.t('app.upload_limit_0fa5edab')}</h2>
          </div>
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {formatBytes(usedBytes) ?? '0 B'} {uiI18n.t('app.used_of_e41e40a3')} {formatBytes(quotaBytes) ?? '—'}
            </span>
            <span className="tabular-nums text-muted-foreground/70">{usedPct}%</span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full ${usedPct >= 90 ? 'bg-rose-500' : 'bg-primary'}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{uiI18n.t('app.new_limit_mb_b68683aa')}</label>
              <Input
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                placeholder={String(Math.round(quotaBytes / (1024 * 1024)))}
                value={quotaMb}
                onChange={(e) => setQuotaMb(e.target.value)}
              />
            </div>
            <Button onClick={handleSetQuota} disabled={setQuota.isPending || !quotaMb} className="gap-2">
              {setQuota.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
              {uiI18n.t('app.set_limit_634082ec')}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground/70">
            {uiI18n.t('app.sets_this_user_s_total_upload_storage_cap_requir_aa6b6048')}
          </p>
        </GlassPanel>
      )}

      {/* Sessions */}
      <GlassPanel className="mb-6 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{uiI18n.t('app.sessions_e11e37a9')} <span className="text-sm font-normal text-muted-foreground">({activeSessions.length} {uiI18n.t('app.active_1a59ea54')}</span></h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleBanAllDevices} disabled={banAllDevices.isPending} className="gap-2">
              {banAllDevices.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              {uiI18n.t('app.ban_all_devices_5ae307a0')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleBanAllIps} disabled={banAllIps.isPending} className="gap-2">
              {banAllIps.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              {uiI18n.t('app.ban_all_ips_126f95d7')}
            </Button>
            {activeSessions.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleRevokeAll} disabled={revokeAll.isPending} className="gap-2">
                {revokeAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                {uiI18n.t('app.revoke_all_04dca2a6')}
              </Button>
            )}
          </div>
        </div>
        {sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{uiI18n.t('app.no_session_records_the_session_tracking_migratio_59f361f8')}</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 ${s.revoked_at ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{s.device_name || uiI18n.t('app.unknown_device_7af13b29')}</span>
                    {s.revoked_at && <Badge variant="secondary" className="text-[10px]">{uiI18n.t('app.revoked_85f17ac0')}</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.ip_address || uiI18n.t('app.no_ip_be90fe49')} · {s.user_agent || uiI18n.t('app.unknown_agent_8f92aa29')}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60">{uiI18n.t('app.last_seen_56462f81')} {formatDistanceToNow(new Date(s.last_seen_at), { addSuffix: true })}</p>
                </div>
                {!s.revoked_at && (
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-amber-400 hover:bg-amber-400/10 hover:text-amber-400"
                      disabled={banDevice.isPending || !(s as any).device_id}
                      onClick={() => handleBanDevice((s as any).device_id)}
                    >
                      <Smartphone className="h-3.5 w-3.5" /> {uiI18n.t('app.ban_device_4a96fd08')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-amber-400 hover:bg-amber-400/10 hover:text-amber-400"
                      disabled={banIp.isPending || !s.ip_address}
                      onClick={() => handleBanIp(s.ip_address)}
                    >
                      <Wifi className="h-3.5 w-3.5" /> {uiI18n.t('app.ban_ip_82ea0a98')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-400 hover:bg-rose-400/10 hover:text-rose-400"
                      disabled={revokeSession.isPending}
                      onClick={async () => {
                        if (await confirm({ get title() { return uiI18n.t('app.revoke_this_session_50792ebb'); }, destructive: true })) {
                          try {
                            await revokeSession.mutateAsync({ sessionId: s.id, userId });
                            toast.success(uiI18n.t('app.session_revoked_ba10de22'));
                          } catch (err: any) {
                            toast.error('Failed: ' + (err?.message ?? uiI18n.t('app.unknown_error_af6321ca')));
                          }
                        }
                      }}
                    >
                      {uiI18n.t('app.revoke_0be72075')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* Content moderation console */}
      <GlassPanel className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-semibold">{uiI18n.t('app.content_4f9be057')}</h2>
        <AdminUserTabs userId={userId} userName={name} />
      </GlassPanel>

      {/* Danger zone — bulk delete (admin OR moderator) */}
      {isStaff && (
        <GlassPanel className="mb-6 border-rose-500/20 p-6">
          <div className="mb-1 flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-rose-400" />
            <h2 className="text-lg font-semibold text-rose-300">{uiI18n.t('app.danger_zone_bulk_delete_db4f4d06')}</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            {uiI18n.t('app.remove_all_of_one_kind_of_this_user_s_content_at_d4e11946')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={deleteContent.isPending} onClick={() => handleDeleteContent('comments')} className="gap-2">
              <MessageSquare className="h-4 w-4" /> {uiI18n.t('app.comments_fce06e20')}
            </Button>
            <Button variant="outline" size="sm" disabled={deleteContent.isPending} onClick={() => handleDeleteContent('posts')} className="gap-2">
              <FileText className="h-4 w-4" /> {uiI18n.t('app.posts_a0ca0c31')}
            </Button>
            <Button variant="outline" size="sm" disabled={deleteContent.isPending} onClick={() => handleDeleteContent('playlists')} className="gap-2">
              <Music2 className="h-4 w-4" /> {uiI18n.t('app.playlists_77b69f32')}
            </Button>
            <Button variant="outline" size="sm" disabled={deleteContent.isPending} onClick={() => handleDeleteContent('tierlists')} className="gap-2">
              <Layers className="h-4 w-4" /> {uiI18n.t('app.tier_lists_bfe1b707')}
            </Button>
            <Button variant="destructive" size="sm" disabled={deleteContent.isPending} onClick={() => handleDeleteContent('all')} className="gap-2">
              {deleteContent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {uiI18n.t('app.delete_everything_554393a2')}
            </Button>
          </div>
        </GlassPanel>
      )}

      <BanUserDialog open={banOpen} onOpenChange={setBanOpen} userId={userId} userName={name} />
    </div>
  );
}
