import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard';
import { IncidentManager } from '@/components/admin/IncidentManager';
import { PopupBuilder } from '@/components/admin/PopupBuilder';
import { ChangelogManager } from '@/components/admin/ChangelogManager';
import { ContentModerationManager } from '@/components/admin/ContentModerationManager';
import { CommentContent } from '@/components/comments/CommentContent';
import { CommentAttachments } from '@/components/comments/CommentAttachments';
import { CommentEmbeds } from '@/components/comments/CommentEmbeds';
import { useRecentCommentsDetailed } from '@/hooks/user/useUserCommentsDetailed';
import { AdminLogs } from '@/components/admin/AdminLogs';
import { PendingForumPosts } from '@/components/admin/PendingForumPosts';
import { PendingSuggestions } from '@/components/admin/PendingSuggestions';
import { WatchRoomManager } from '@/components/admin/WatchRoomsManager';
import { AppVersionManager } from '@/components/admin/AppVersionManager';
import { AppReleaseManager } from '@/components/admin/AppReleaseManager';
import { ModerationLogs } from '@/components/admin/ModerationLogs';
import { ReportManager } from '@/components/admin/ReportManager';
import { AnalyticsActiveUsers } from '@/components/admin/AnalyticsActiveUsers';
import { NewsComposer } from '@/components/admin/NewsComposer';
import { NewsManager } from '@/components/admin/NewsManager';
import { RedirectManager } from '@/components/admin/RedirectManager';
import { UserActivityLogs } from '@/components/admin/UserActivityLogs';
import { AchievementManager } from '@/components/admin/AchievementManager';
import { BadgeManager } from '@/components/admin/BadgeManager';
import { ApiAdminPanel } from '@/components/admin/ApiAdminPanel';
// New panels — admin dashboard overhaul
import { UserStatsPanel } from '@/components/admin/UserStatsPanel';
import { StreamingAnalyticsPanel } from '@/components/admin/StreamingAnalyticsPanel';
import { PerformanceInsightsPanel } from '@/components/admin/PerformanceInsightsPanel';
import { UpdateManagementPanel } from '@/components/admin/UpdateManagementPanel';
import { CrashReportPanel } from '@/components/admin/CrashReportPanel';
import { DeviceBanPanel } from '@/components/admin/DeviceBanPanel';
import { IPBanPanel } from '@/components/admin/IPBanPanel';
import { BanAuditLogPanel } from '@/components/admin/BanAuditLogPanel';
import { BanTemplatesPanel } from '@/components/admin/BanTemplatesPanel';
import { LogViewerPanel } from '@/components/desktop/LogViewerPanel';
import { useAdminMessages } from '@/hooks/admin/useAdminMessages';
import { Link } from 'react-router-dom';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { cn } from '@/lib/utils';
import { AdminNav } from '@/components/admin/AdminNav';
import { buildAdminNav } from '@/components/admin/adminSections';
import { StatTile } from '@/components/admin/StatTile';
import { UserManagementTab } from '@/components/admin/UserManagementTab';
import {
  ArrowLeft, Shield, ShieldAlert, Users, MessageSquare, Star,
  Trash2, Ban, AlertTriangle, BarChart3, Send,
  Settings, Power, BellRing, Server, AlertCircle, History, Layers, FileText, Image, Radio, Menu, ChevronRight,
  Inbox,
  Globe, ShoppingBag, Lightbulb, Activity, ExternalLink,
} from 'lucide-react';

export default function AdminPage() {
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();
  const { isAdmin, isModerator, profile, isLoading, rolesResolved } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [messageTitle, setMessageTitle] = useState('');
  const [messageContent, setMessageContent] = useState('');
  /**
   * The notification panel's audience. Both halves are needed: the choice, and
   * the handle to resolve when the choice is a single user.
   */
  const [notifyTarget, setNotifyTarget] = useState<'all' | 'user'>('all');
  const [notifyRecipient, setNotifyRecipient] = useState('');
  const [messagingUserId, setMessagingUserId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { groups: navGroups, items: navSections } = useMemo(
    () => buildAdminNav({ isAdmin, isModerator, isDesktopApp }),
    [isAdmin, isModerator, isDesktopApp],
  );

  /**
   * The open section lives in the query string, so a reload, a bookmark and a
   * link from a colleague all land on the same panel. Thirty sections deep,
   * re-finding one by hand after every refresh was the tax that made the old
   * state-only version tiring to work in.
   *
   * Derived rather than stored: a slug that is unknown, or that this viewer's
   * role cannot open, falls back to their first section instead of parking an
   * empty pane — and the fallback re-resolves once the role query lands, which
   * the old `useState` initialiser could not, having latched whatever the list
   * looked like before roles were known.
   */
  const sectionParam = searchParams.get('section');
  const activeTab =
    sectionParam && navSections.some((item) => item.value === sectionParam)
      ? sectionParam
      : (navSections[0]?.value ?? 'analytics');

  const setActiveTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', value);
    // Replaced, not pushed: back should leave the dashboard, not walk through
    // every section visited inside it.
    setSearchParams(next, { replace: true });
  };

  /** Names the open section on the mobile trigger, which used to read "Dashboard Menu" whichever panel was showing. */
  const activeLabel =
    navSections.find((item) => item.value === activeTab)?.label ?? 'Dashboard Menu';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [viewingActivityUserId, setViewingActivityUserId] = useState<string | null>(null);
  const { deleteMessage } = useAdminMessages();

  const isStaff = isAdmin || isModerator;

  // Redirect if not staff. `AdminRoute` is the real gate — it decides before this
  // component mounts — and this is defence in depth for any future mount that bypasses
  // it. It waits on `rolesResolved`, not `isLoading`, because the auth session settles
  // before the profile query that carries staff status, so keying off `isLoading` alone
  // bounces admins on a cold load.
  //
  // Deliberately no early `return null` here: the hooks below it would then run on some
  // renders and not others, which is the "rendered fewer hooks than expected" crash.
  useEffect(() => {
    if (!isLoading && rolesResolved && !isStaff) {
      navigate('/');
    }
  }, [isLoading, rolesResolved, isStaff, navigate]);

  // Fetch maintenance mode
  const { data: maintenanceMode } = useQuery({
    queryKey: ['maintenance_mode'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('maintenance_mode' as any)
        .select('*')
        .single() as any);
      if (error && error.code !== 'PGRST116') throw error;
      return data as { id: string; is_active: boolean; message: string } | null;
    },
    enabled: isAdmin,
  });

  // Total user count (not limited)
  const { data: totalUsersCount } = useQuery({
    queryKey: ['admin_users_count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      return count || 0;
    },
    enabled: isStaff,
  });

  // Headline figures for the summary row. They are their own `head: true` counts
  // because the two list queries above stop at 100 rows — counting those gave a
  // "Banned users" tile that silently meant "banned among the 100 newest".
  const { data: bannedUsersCount } = useQuery({
    queryKey: ['admin_banned_count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_banned', true);

      if (error) throw error;
      return count || 0;
    },
    enabled: isStaff,
  });

  const { data: totalCommentsCount } = useQuery({
    queryKey: ['admin_comments_count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      return count || 0;
    },
    enabled: isStaff,
  });

  // Recent comments across the site, enriched with source title, deep-link,
  // structured media (attachments/embeds/poll) and author profile.
  const { comments: recentComments, isLoading: loadingComments } = useRecentCommentsDetailed(60);

  // Fetch sent messages
  const { data: sentMessages, isLoading: loadingSentMessages } = useQuery({
    queryKey: ['admin_sent_messages'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('admin_messages' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50) as any);

      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
  });

  // Delete comment mutation
  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recent-comments-detailed'] });
      toast.success('Comment deleted');
    },
    onError: () => {
      toast.error('Failed to delete comment');
    },
  });

  // Toggle maintenance mode
  const toggleMaintenance = useMutation({
    mutationFn: async () => {
      const { data: currentUser } = await supabase.auth.getUser();
      const { error } = await (supabase
        .from('maintenance_mode' as any)
        .update({
          is_active: !maintenanceMode?.is_active,
          enabled_at: !maintenanceMode?.is_active ? new Date().toISOString() : null,
          enabled_by: !maintenanceMode?.is_active ? currentUser.user?.id : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', maintenanceMode?.id) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance_mode'] });
      toast.success(maintenanceMode?.is_active ? 'Maintenance mode disabled' : 'Maintenance mode enabled');
    },
    onError: () => {
      toast.error('Failed to toggle maintenance mode');
    },
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async ({ title, content, recipientId }: { title: string; content: string; recipientId: string | null }) => {
      const { data: currentUser } = await supabase.auth.getUser();
      const { error } = await (supabase
        .from('admin_messages' as any)
        .insert({
          title,
          content,
          message_type: recipientId ? 'individual' : 'broadcast',
          recipient_id: recipientId,
          sender_id: currentUser.user?.id,
        }) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_sent_messages'] });
      toast.success('Message sent successfully');
      setMessageTitle('');
      setMessageContent('');
      setNotifyRecipient('');
    },
    onError: (error: any) => {
      console.error('Failed to send message:', error);
      if (error?.code === '42P01') {
        toast.error('Admin messages table not found. Please run the migration.');
      } else if (error?.message?.includes('permission denied') || error?.code === '42501') {
        toast.error('Permission denied. Make sure you are an admin.');
      } else {
        toast.error('Failed to send message: ' + (error?.message || 'Unknown error'));
      }
    },
  });

  // Fetch badge counts
  const { data: badgeCounts } = useQuery({
    queryKey: ['admin_badge_counts'],
    queryFn: async () => {
      try {
        const [
          { count: reports },
          { count: suggestions },
          { count: posts }
        ] = await Promise.all([
          supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('user_suggestions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('forum_posts' as any).select('*', { count: 'exact', head: true }).eq('is_approved', false)
        ]);
        return { reports: reports || 0, suggestions: suggestions || 0, posts: posts || 0 };
      } catch (err) {
        console.error('Error fetching badge counts:', err);
        return { reports: 0, suggestions: 0, posts: 0 };
      }
    },
    refetchInterval: 30000,
  });

  /**
   * Turns a typed username or id into the value `admin_messages.recipient_id`
   * holds — `profiles.user_id`, the auth id space, which is what
   * `useAdminMessages` matches a signed-in reader against. `profiles.id` is a
   * different column and matching on it would address nobody.
   *
   * The "Specific User" option used to pass `null` down either branch, so every
   * message sent from that panel went to every user on the site regardless of
   * what was picked. Returns null when nothing matches, and the caller refuses
   * to send rather than falling back to a broadcast.
   *
   * The id columns are typed `uuid`, so a non-uuid needle is only ever compared
   * against `username` — asking Postgres to cast "someone" to a uuid fails the
   * whole query.
   */
  const resolveRecipientId = async (raw: string): Promise<string | null> => {
    const needle = raw.trim();
    if (!needle) return null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(needle);
    const rows = supabase.from('profiles').select('user_id').limit(1);
    const { data, error } = isUuid
      ? await rows.or(`user_id.eq.${needle},id.eq.${needle}`).maybeSingle()
      : await rows.ilike('username', needle).maybeSingle();

    if (error) {
      console.error('Recipient lookup failed:', error);
      return null;
    }
    return (data?.user_id as string | undefined) ?? null;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden" >
      <Background />
      <Sidebar />

      <main className={cn('relative z-10 mx-auto max-w-[1800px] px-4 py-6 pb-24 sm:px-6 md:pb-6', isDesktopApp ? 'md:pl-6' : 'md:pl-32')}>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="mt-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] p-2 text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
                {isAdmin ? 'Administrator' : 'Moderator'}
              </p>
              <h1 className="font-display mt-1.5 text-2xl font-black tracking-tight sm:text-[1.75rem]">
                Admin Dashboard
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {navSections.length} sections · signed in as{' '}
                {profile?.display_name || profile?.username || 'staff'}
              </p>
            </div>
          </div>

          {/* The status chip is also the way into the section that changes it, so
              the state and its switch are never more than one click apart. */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors',
                maintenanceMode?.is_active
                  ? 'border-orange/30 bg-orange/10 text-orange hover:bg-orange/20'
                  : 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', maintenanceMode?.is_active ? 'bg-orange' : 'animate-pulse bg-primary')} />
              {maintenanceMode?.is_active ? 'Maintenance mode' : 'Site online'}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          <StatTile icon={Users} tone="primary" value={(totalUsersCount ?? 0).toLocaleString()} label="Total users" />
          <StatTile icon={MessageSquare} tone="secondary" value={(totalCommentsCount ?? recentComments?.length ?? 0).toLocaleString()} label="Comments" />
          <StatTile icon={Ban} tone="destructive" value={(bannedUsersCount ?? 0).toLocaleString()} label="Banned users" />
          {/* The rail's badges each show one queue; this is the three of them
              added up, so "is anything waiting on me?" is answerable without
              walking the nav. System status moved to the header chip, which can
              also open the section that toggles it. */}
          <StatTile
            icon={Inbox}
            tone="amber"
            value={(
              (badgeCounts?.reports ?? 0) +
              (badgeCounts?.suggestions ?? 0) +
              (badgeCounts?.posts ?? 0)
            ).toLocaleString()}
            label="Awaiting review"
          />
        </div>

        {/* Main Content with Left Navigation */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="vertical"
          className="relative flex flex-col gap-8 md:flex-row"
        >
          {/* Mobile Navigation Toggle */}
          <div className="mb-6 md:hidden">
            <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="h-14 w-full justify-between rounded-2xl border-white/[0.07] bg-white/[0.03] px-5">
                  <span className="flex min-w-0 items-center gap-3">
                    <Menu className="h-5 w-5 shrink-0 text-primary" />
                    <span className="truncate font-bold">{activeLabel}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[320px] border-white/5 bg-background/95 p-0 backdrop-blur-xl"
                // Radix focuses the first tabbable node on open — here the filter
                // box, which on a phone means the keyboard covers the list the
                // visitor opened the sheet to read.
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                <SheetHeader className="border-b border-white/5 p-6 text-left">
                  <SheetTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Admin Panel
                  </SheetTitle>
                </SheetHeader>
                <div className="max-h-[calc(100vh-88px)] overflow-y-auto p-4">
                  <AdminNav
                    groups={navGroups}
                    badgeCounts={badgeCounts}
                    onSelect={() => setIsMenuOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Navigation Sidebar. Scrolls inside its own sticky box: the full list
              is taller than a laptop viewport, and a sticky panel that overflows
              simply hides its last rows. */}
          <div className="hidden flex-shrink-0 md:block md:w-64 lg:w-72">
            <GlassPanel className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl p-3">
              <AdminNav groups={navGroups} badgeCounts={badgeCounts} />
            </GlassPanel>
          </div>

          <div className="flex-1 min-w-0">

            {/* Analytics Tab */}
            <TabsContent value="analytics">
              <div className="space-y-8">
                <AnalyticsActiveUsers />
                <AnalyticsDashboard />
              </div>
            </TabsContent>

            {/* User Reports Tab */}
            <TabsContent value="reports">
              <ReportManager />
            </TabsContent>

            {/* Suggestions Tab */}
            <TabsContent value="suggestions">
              <PendingSuggestions />
            </TabsContent>

            {/* Achievements Tab */}
            <TabsContent value="achievements">
              <AchievementManager />
            </TabsContent>

            {/* Badges Tab */}
            <TabsContent value="badges">
              <BadgeManager />
            </TabsContent>

            {/* Analytics expansion tabs */}
            <TabsContent value="userstats">
              <UserStatsPanel />
            </TabsContent>
            <TabsContent value="streaming">
              <StreamingAnalyticsPanel />
            </TabsContent>
            <TabsContent value="performance">
              <PerformanceInsightsPanel />
            </TabsContent>

            {/* Electron-gated tabs */}
            <TabsContent value="updates">
              <UpdateManagementPanel />
            </TabsContent>
            <TabsContent value="crashes">
              <CrashReportPanel />
            </TabsContent>
            <TabsContent value="desktop-logs">
              <LogViewerPanel />
            </TabsContent>

            {/* Ban management tabs */}
            <TabsContent value="ban-management">
              <div className="space-y-10">
                <DeviceBanPanel />
                <IPBanPanel />
                <BanTemplatesPanel />
              </div>
            </TabsContent>
            <TabsContent value="ban-audit">
              <BanAuditLogPanel />
            </TabsContent>

            {/* Users Tab */}
            <UserManagementTab
              onMessageUser={setMessagingUserId}
              onViewActivity={setViewingActivityUserId}
            />

            {/* Comments Tab */}
            <TabsContent value="comments">
              <GlassPanel className="p-6">
                <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Recent Comments
                </h2>

                {loadingComments ? (
                  <div className="text-center py-12 text-muted-foreground">Loading...</div>
                ) : recentComments && recentComments.length > 0 ? (
                  <div className="space-y-4">
                    {recentComments.map((comment) => (
                      <div
                        key={comment.id}
                        className="p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Link
                                to={`/admin/user/${comment.user_id}`}
                                className="font-medium hover:text-primary transition-colors"
                              >
                                {comment.author?.display_name || comment.author?.username || 'Unknown'}
                              </Link>
                              {comment.is_spoiler && (
                                <span className="px-2 py-0.5 rounded-full bg-orange/20 text-orange text-xs">
                                  Spoiler
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatDate(comment.created_at)}
                              </span>
                            </div>
                            <CommentContent content={comment.content} clamp className="mb-2" />
                            <CommentAttachments attachments={comment.attachments} className="mb-2" />
                            <CommentEmbeds embeds={comment.embeds} poll={comment.poll} />
                            <p className="text-xs text-muted-foreground mt-2">
                              <Link to={comment.target} className="hover:text-primary transition-colors">
                                {comment.title}
                              </Link>
                              {comment.hasEpisode && ' • Episode'}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteComment.mutate(comment.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No comments yet</p>
                  </div>
                )}
              </GlassPanel>
            </TabsContent>

            {/* Content Moderation Tab */}
            <TabsContent value="content">
              <GlassPanel className="p-6">
                <ContentModerationManager />
              </GlassPanel>
            </TabsContent>

            {/* News Tab */}
            <TabsContent value="news">
              <div className="space-y-6">
                <NewsComposer />
                <NewsManager />
              </div>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications">
              <div className="grid grid-cols-1 gap-8">
                <div className="space-y-6">
                  <GlassPanel className="p-6">
                    <h3 className="font-display text-xl font-bold mb-6 flex items-center gap-2">
                      <BellRing className="w-5 h-5 text-primary" />
                      Create System Notification
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Notification Title</label>
                        <Input
                          placeholder="Maintenance, Update, etc."
                          value={messageTitle}
                          onChange={(e) => setMessageTitle(e.target.value)}
                          className="bg-muted/30"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Message Content</label>
                        <Textarea
                          placeholder="Write your message here..."
                          value={messageContent}
                          onChange={(e) => setMessageContent(e.target.value)}
                          className="bg-muted/30 min-h-[120px]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">Target Type</label>
                          <select
                            className="w-full bg-muted/30 border border-input rounded-md px-3 py-2 text-sm"
                            value={notifyTarget}
                            onChange={(e) => setNotifyTarget(e.target.value === 'user' ? 'user' : 'all')}
                          >
                            <option value="all">Broadcast (All Users)</option>
                            <option value="user">Specific User</option>
                          </select>
                        </div>
                        {notifyTarget === 'user' && (
                          <div>
                            <label className="text-sm font-medium mb-1.5 block">Username or user ID</label>
                            <Input
                              placeholder="e.g. snozxyx"
                              value={notifyRecipient}
                              onChange={(e) => setNotifyRecipient(e.target.value)}
                              className="bg-muted/30"
                            />
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={async () => {
                          if (notifyTarget === 'all') {
                            sendMessage.mutate({
                              title: messageTitle,
                              content: messageContent,
                              recipientId: null,
                            });
                            return;
                          }
                          const recipientId = await resolveRecipientId(notifyRecipient);
                          if (!recipientId) {
                            toast.error('No user matches that username or id');
                            return;
                          }
                          sendMessage.mutate({
                            title: messageTitle,
                            content: messageContent,
                            recipientId,
                          });
                        }}
                        disabled={
                          sendMessage.isPending ||
                          !messageTitle ||
                          !messageContent ||
                          (notifyTarget === 'user' && !notifyRecipient.trim())
                        }
                        className="w-full gap-2"
                      >
                        <Send className="w-4 h-4" />
                        {sendMessage.isPending
                          ? 'Sending...'
                          : notifyTarget === 'user'
                            ? 'Send to user'
                            : 'Send broadcast'}
                      </Button>
                    </div>
                  </GlassPanel>

                  <GlassPanel className="p-6">
                    <h3 className="font-medium mb-4">Sent Notifications History</h3>
                    {loadingSentMessages ? (
                      <div className="animate-pulse space-y-3">
                        {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted/50 rounded-lg" />)}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {sentMessages?.map((msg: any) => (
                          <div key={msg.id} className="p-3 rounded-lg bg-muted/20 border border-border/30 text-xs">
                            <div className="flex justify-between items-start mb-1">
                              <div className="flex-1">
                                <span className="font-bold block">{msg.title}</span>
                                <span className="text-[10px] text-muted-foreground">{formatDate(msg.created_at)}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  if (await confirm({ title: 'Delete this notification?', destructive: true })) deleteMessage.mutate(msg.id);
                                }}
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <p className="line-clamp-2 text-muted-foreground mr-8">{msg.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassPanel>
                </div>
              </div>
            </TabsContent>

            {/* Popups Tab */}
            <TabsContent value="popups">
              <GlassPanel className="p-6">
                <PopupBuilder />
              </GlassPanel>
            </TabsContent>

            {/* API Admin Tab */}
            <TabsContent value="api-admin">
              <ApiAdminPanel />
            </TabsContent>

            {/* Incidents Tab */}
            <TabsContent value="incidents">
              <GlassPanel className="p-6">
                <IncidentManager />
              </GlassPanel>
            </TabsContent>


            {/* Changelog Tab */}
            <TabsContent value="changelog">
              <GlassPanel className="p-6">
                <ChangelogManager />
              </GlassPanel>
            </TabsContent>

            {/* Admin Logs Tab */}
            <TabsContent value="logs">
              <GlassPanel className="p-6">
                <AdminLogs />
              </GlassPanel>
            </TabsContent>

            {/* Pending Forum Posts Tab */}
            <TabsContent value="pending">
              <div className="space-y-6">
                <GlassPanel className="p-6">
                  <h2 className="font-display text-xl font-semibold mb-6">Pending Forum Posts</h2>
                  <PendingForumPosts />
                </GlassPanel>

                <GlassPanel className="p-6">
                  <h2 className="font-display text-xl font-semibold mb-6">User Suggestions</h2>
                  <PendingSuggestions />
                </GlassPanel>
              </div>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings">
              <div className="space-y-6">
                <GlassPanel className="p-6">
                  <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                    <Power className="w-5 h-5 text-primary" />
                    Maintenance Mode
                  </h2>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                    <div>
                      <p className="font-medium">System Maintenance</p>
                      <p className="text-sm text-muted-foreground">
                        {maintenanceMode?.is_active
                          ? 'Site is currently in maintenance mode. Users cannot access the platform.'
                          : 'Site is currently online and accessible to all users.'}
                      </p>
                    </div>
                    <Button
                      onClick={() => toggleMaintenance.mutate()}
                      disabled={toggleMaintenance.isPending}
                      variant={maintenanceMode?.is_active ? 'default' : 'destructive'}
                      className="gap-2"
                    >
                      <Power className="w-4 h-4" />
                      {maintenanceMode?.is_active ? 'Disable Maintenance' : 'Enable Maintenance'}
                    </Button>
                  </div>
                </GlassPanel>

                <GlassPanel className="p-6">
                  <AppReleaseManager />
                </GlassPanel>

                <GlassPanel className="p-6">
                  <RedirectManager />
                </GlassPanel>
              </div>
            </TabsContent>
            <TabsContent value="watchrooms">
              <GlassPanel className="p-6">
                <WatchRoomManager />
              </GlassPanel>
            </TabsContent>

            <TabsContent value="moderation">
              <GlassPanel className="p-6">
                <ModerationLogs />
              </GlassPanel>
            </TabsContent>
          </div>
        </Tabs >
      </main >

      {/* User Activity Sheet */}
      < Sheet open={!!viewingActivityUserId
      } onOpenChange={(open) => !open && setViewingActivityUserId(null)}>
        <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0 border-white/5 bg-background/95 backdrop-blur-xl border-l">
          <SheetHeader className="p-6 border-b border-white/5">
            <SheetTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-secondary" />
              User Activity Log
            </SheetTitle>
          </SheetHeader>
          <div className="p-6 overflow-y-auto h-[calc(100vh-80px)]">
            {viewingActivityUserId && <UserActivityLogs userId={viewingActivityUserId} />}
          </div>
        </SheetContent>
      </Sheet >

      {/* Direct Message Sheet */}
      < Sheet open={!!messagingUserId} onOpenChange={(open) => !open && setMessagingUserId(null)}>
        <SheetContent side="right" className="w-[400px] sm:w-[500px] p-6 border-white/5 bg-background/95 backdrop-blur-xl border-l">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2 text-primary font-bold">
              <Send className="w-6 h-6" />
              Direct Message
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Subject</label>
              <Input
                placeholder="Enter subject..."
                value={messageTitle}
                onChange={(e) => setMessageTitle(e.target.value)}
                className="bg-muted/30 border-white/5 focus:border-primary/50 transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Message</label>
              <Textarea
                placeholder="What would you like to say?..."
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                className="bg-muted/30 border-white/5 min-h-[300px] focus:border-primary/50 transition-colors"
              />
            </div>
            <Button
              onClick={() => {
                sendMessage.mutate({
                  title: messageTitle,
                  content: messageContent,
                  recipientId: messagingUserId
                });
                setMessagingUserId(null);
                setMessageTitle('');
                setMessageContent('');
                toast.success('Message sent successfully.');
              }}
              disabled={sendMessage.isPending || !messageTitle || !messageContent}
              className="w-full gap-2 font-bold py-6 group"
            >
              <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              {sendMessage.isPending ? 'Sending...' : 'Send Message Now'}
            </Button>
          </div>
        </SheetContent>
      </Sheet >
    </div >
  );
}

