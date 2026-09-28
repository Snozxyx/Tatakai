import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
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
  { key: 'can_comment', label: 'Comment', hint: 'Post comments anywhere' },
  { key: 'can_post', label: 'Post', hint: 'Create forum / community posts' },
  { key: 'can_tierlist', label: 'Tier lists', hint: 'Create tier lists' },
  { key: 'can_upload', label: 'Upload', hint: 'Upload to user media' },
  { key: 'can_access_community', label: 'Community', hint: 'Access community features' },
];

function fmtWatch(seconds: number | null): string {
  const s = seconds ?? 0;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `${h.toLocaleString()}h`;
  return `${Math.floor(s / 60)}m`;
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
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

  if (!userId) return <div className="p-8">Invalid user id</div>;

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
          <ArrowLeft className="h-4 w-4" /> Admin
        </Button>
        <GlassPanel className="p-12 text-center">
          <ShieldQuestion className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">User not found or profile is inaccessible.</p>
        </GlassPanel>
      </div>
    );
  }

  const name = profile.display_name || profile.username || 'User';
  const roleLabel = profile.is_admin ? 'Admin' : profile.is_moderator ? 'Moderator' : (profile.role || 'user');
  // last_login_at comes from the unapplied user_sessions migration; last_seen (applied,
  // heartbeat-updated) is the live fallback.
  const lastLogin = profile.last_login_at ?? (profile as any).last_seen ?? null;

  const togglePriv = async (key: Privilege, enabled: boolean) => {
    try {
      await setPriv.mutateAsync({ userId, privilege: key, enabled });
      toast.success(`${enabled ? 'Enabled' : 'Disabled'} ${key.replace('can_', '')}`);
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? 'unknown error'));
    }
  };

  const handleUnban = async () => {
    if (!(await confirm({ title: `Unban ${name}?` }))) return;
    try {
      await unban.mutateAsync(userId);
      toast.success('User unbanned');
    } catch (err: any) {
      toast.error('Failed to unban: ' + (err?.message ?? 'unknown error'));
    }
  };

  const handleRevokeAll = async () => {
    if (!(await confirm({ title: 'Revoke all sessions?', description: 'The user will be signed out on every device.', destructive: true }))) return;
    try {
      const n = await revokeAll.mutateAsync(userId);
      toast.success(`Revoked ${n ?? ''} session(s)`.trim());
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? 'unknown error'));
    }
  };

  const activeSessions = sessions.filter((s) => !s.revoked_at);

  const isAdmin = deriveIsAdmin(profile);
  const isModerator = deriveIsModerator(profile);

  const toggleRole = async (role: 'admin' | 'moderator', enabled: boolean) => {
    if (!(await confirm({
      title: `${enabled ? 'Grant' : 'Revoke'} ${role} for ${name}?`,
      destructive: !enabled,
    }))) return;
    try {
      await setStaffRole.mutateAsync({ userId, role, enabled });
      toast.success(`${enabled ? 'Granted' : 'Revoked'} ${role}`);
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? 'unknown error'));
    }
  };

  const handleBanAllDevices = async () => {
    if (!(await confirm({ title: 'Ban all devices?', description: 'Every device id linked to this user is blocked.', destructive: true }))) return;
    try {
      const n = await banAllDevices.mutateAsync({ userId });
      toast.success(`Banned ${n} device(s)`);
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? 'unknown error'));
    }
  };

  const handleBanAllIps = async () => {
    if (!(await confirm({ title: 'Ban all IPs?', description: 'Every IP known for this user is blocked.', destructive: true }))) return;
    try {
      const n = await banAllIps.mutateAsync({ userId });
      toast.success(`Banned ${n} IP(s)`);
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? 'unknown error'));
    }
  };

  const handleBanDevice = async (deviceId: string | null | undefined) => {
    if (!deviceId) { toast.error('No device id on this session'); return; }
    if (!(await confirm({ title: 'Ban this device?', destructive: true }))) return;
    try {
      await banDevice.mutateAsync({ deviceId, targetUserId: userId });
      toast.success('Device banned');
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? 'unknown error'));
    }
  };

  const handleBanIp = async (ip: string | null | undefined) => {
    if (!ip) { toast.error('No IP on this session'); return; }
    if (!(await confirm({ title: 'Ban this IP?', destructive: true }))) return;
    try {
      await banIp.mutateAsync({ ip, targetUserId: userId });
      toast.success('IP banned');
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? 'unknown error'));
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
    if (!Number.isFinite(mb) || mb < 0) { toast.error('Enter a valid size in MB'); return; }
    try {
      await setQuota.mutateAsync({ userId, bytes: Math.round(mb * 1024 * 1024) });
      toast.success(`Upload limit set to ${mb} MB`);
      setQuotaMb('');
    } catch (err: any) {
      toast.error('Failed to set limit: ' + (err?.message ?? 'unknown error'));
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
      title: `Delete ${label[scope]} by ${name}?`,
      description: 'Comments and posts are removed but their thread structure is kept; playlists and tier lists are deleted permanently. This cannot be undone.',
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
      toast.success(parts.length ? `Deleted ${parts.join(', ')}.` : 'Nothing to delete.');
    } catch (err: any) {
      toast.error('Failed to delete: ' + (err?.message ?? 'unknown error'));
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => navigate('/admin')} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Admin
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isModerator ? 'secondary' : 'outline'}
            size="sm"
            disabled={setStaffRole.isPending || isAdmin}
            onClick={() => toggleRole('moderator', !isModerator)}
            className="gap-2"
            title={isAdmin ? 'Admins are always moderators' : undefined}
          >
            <ShieldCheck className="h-4 w-4" /> {isModerator ? 'Moderator' : 'Make moderator'}
          </Button>
          <Button
            variant={isAdmin ? 'secondary' : 'outline'}
            size="sm"
            disabled={setStaffRole.isPending}
            onClick={() => toggleRole('admin', !isAdmin)}
            className="gap-2"
          >
            <Shield className="h-4 w-4" /> {isAdmin ? 'Admin' : 'Make admin'}
          </Button>
          {profile.is_banned ? (
            <Button variant="outline" onClick={handleUnban} disabled={unban.isPending} className="gap-2">
              {unban.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              Unban
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setBanOpen(true)} className="gap-2">
              <Ban className="h-4 w-4" /> Ban user
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
              {profile.is_banned && <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> Banned</Badge>}
            </div>
            {profile.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
            <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground/60">{profile.user_id}</p>
            {profile.is_banned && profile.ban_reason && (
              <p className="mt-2 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                Ban reason: {profile.ban_reason}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/5 pt-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Joined</p>
            <p className="font-medium">{profile.created_at ? format(new Date(profile.created_at), 'PP') : '—'}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground"><Clock className="h-3 w-3" /> Last login</p>
            <p className="font-medium">{lastLogin ? formatDistanceToNow(new Date(lastLogin), { addSuffix: true }) : '—'}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground"><MonitorSmartphone className="h-3 w-3" /> Device</p>
            <p className="truncate font-medium">{profile.device_name ?? (profile as any).device_id ?? '—'}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground"><Globe className="h-3 w-3" /> Country</p>
            <p className="font-medium">{profile.country || '—'}</p>
          </div>
        </div>
      </GlassPanel>

      {/* Activity */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={MessageSquare} label="Comments" value={(activity?.comments ?? 0).toLocaleString()} />
        <StatCard icon={FileText} label="Posts" value={(activity?.posts ?? 0).toLocaleString()} />
        <StatCard icon={Activity} label="Visits (30d)" value={(activity?.visits30d ?? 0).toLocaleString()} />
        <StatCard icon={Clock} label="Watch time" value={fmtWatch(profile.total_watch_time_seconds)} />
      </div>

      {/* Privileges */}
      <GlassPanel className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-semibold">Privileges</h2>
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
        <p className="mt-3 text-xs text-muted-foreground/70">Turning a privilege off blocks the action at the database layer (RESTRICTIVE RLS).</p>
      </GlassPanel>

      {/* Upload limit — admin only */}
      {viewerIsAdmin && (
        <GlassPanel className="mb-6 p-6">
          <div className="mb-4 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Upload limit</h2>
          </div>
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {formatBytes(usedBytes) ?? '0 B'} used of {formatBytes(quotaBytes) ?? '—'}
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
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">New limit (MB)</label>
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
              Set limit
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground/70">
            Sets this user's total upload storage cap. Requires the storage-quota migration to be applied.
          </p>
        </GlassPanel>
      )}

      {/* Sessions */}
      <GlassPanel className="mb-6 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Sessions <span className="text-sm font-normal text-muted-foreground">({activeSessions.length} active)</span></h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleBanAllDevices} disabled={banAllDevices.isPending} className="gap-2">
              {banAllDevices.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              Ban all devices
            </Button>
            <Button variant="outline" size="sm" onClick={handleBanAllIps} disabled={banAllIps.isPending} className="gap-2">
              {banAllIps.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              Ban all IPs
            </Button>
            {activeSessions.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleRevokeAll} disabled={revokeAll.isPending} className="gap-2">
                {revokeAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Revoke all
              </Button>
            )}
          </div>
        </div>
        {sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No session records. The session-tracking migration may not be applied yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 ${s.revoked_at ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{s.device_name || 'Unknown device'}</span>
                    {s.revoked_at && <Badge variant="secondary" className="text-[10px]">Revoked</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.ip_address || 'no ip'} · {s.user_agent || 'unknown agent'}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60">Last seen {formatDistanceToNow(new Date(s.last_seen_at), { addSuffix: true })}</p>
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
                      <Smartphone className="h-3.5 w-3.5" /> Ban device
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-amber-400 hover:bg-amber-400/10 hover:text-amber-400"
                      disabled={banIp.isPending || !s.ip_address}
                      onClick={() => handleBanIp(s.ip_address)}
                    >
                      <Wifi className="h-3.5 w-3.5" /> Ban IP
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-400 hover:bg-rose-400/10 hover:text-rose-400"
                      disabled={revokeSession.isPending}
                      onClick={async () => {
                        if (await confirm({ title: 'Revoke this session?', destructive: true })) {
                          try {
                            await revokeSession.mutateAsync({ sessionId: s.id, userId });
                            toast.success('Session revoked');
                          } catch (err: any) {
                            toast.error('Failed: ' + (err?.message ?? 'unknown error'));
                          }
                        }
                      }}
                    >
                      Revoke
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
        <h2 className="mb-4 text-lg font-semibold">Content</h2>
        <AdminUserTabs userId={userId} userName={name} />
      </GlassPanel>

      {/* Danger zone — bulk delete (admin OR moderator) */}
      {isStaff && (
        <GlassPanel className="mb-6 border-rose-500/20 p-6">
          <div className="mb-1 flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-rose-400" />
            <h2 className="text-lg font-semibold text-rose-300">Danger zone — bulk delete</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Remove all of one kind of this user's content at once. Comments and posts keep their thread
            structure (soft delete); playlists and tier lists are deleted permanently.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={deleteContent.isPending} onClick={() => handleDeleteContent('comments')} className="gap-2">
              <MessageSquare className="h-4 w-4" /> Comments
            </Button>
            <Button variant="outline" size="sm" disabled={deleteContent.isPending} onClick={() => handleDeleteContent('posts')} className="gap-2">
              <FileText className="h-4 w-4" /> Posts
            </Button>
            <Button variant="outline" size="sm" disabled={deleteContent.isPending} onClick={() => handleDeleteContent('playlists')} className="gap-2">
              <Music2 className="h-4 w-4" /> Playlists
            </Button>
            <Button variant="outline" size="sm" disabled={deleteContent.isPending} onClick={() => handleDeleteContent('tierlists')} className="gap-2">
              <Layers className="h-4 w-4" /> Tier lists
            </Button>
            <Button variant="destructive" size="sm" disabled={deleteContent.isPending} onClick={() => handleDeleteContent('all')} className="gap-2">
              {deleteContent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete everything
            </Button>
          </div>
        </GlassPanel>
      )}

      <BanUserDialog open={banOpen} onOpenChange={setBanOpen} userId={userId} userName={name} />
    </div>
  );
}
