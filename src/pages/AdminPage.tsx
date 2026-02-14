import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard';
import { VideoServerManager } from '@/components/admin/VideoServerManager';
import { IncidentManager } from '@/components/admin/IncidentManager';
import { PopupBuilder } from '@/components/admin/PopupBuilder';
import { ChangelogManager } from '@/components/admin/ChangelogManager';
import { ContentModerationManager } from '@/components/admin/ContentModerationManager';
import { AdminLogs } from '@/components/admin/AdminLogs';
import { PendingForumPosts } from '@/components/admin/PendingForumPosts';
import { PendingSuggestions } from '@/components/admin/PendingSuggestions';
import { WatchRoomManager } from '@/components/admin/WatchRoomsManager';
import { AppVersionManager } from '@/components/admin/AppVersionManager';
import { ModerationLogs } from '@/components/admin/ModerationLogs';
import { CustomSourceManager } from '@/components/admin/CustomSourceManager';
import { ReportManager } from '@/components/admin/ReportManager';
import { LanguageManager } from '@/components/admin/LanguageManager';
import { AnalyticsActiveUsers } from '@/components/admin/AnalyticsActiveUsers';
import { MarketplaceManager } from '@/components/admin/MarketplaceManager';
import { RedirectManager } from '@/components/admin/RedirectManager';
import { UserActivityLogs } from '@/components/admin/UserActivityLogs';
import { useAdminMessages } from '@/hooks/useAdminMessages';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Shield, ShieldCheck, ShieldOff, ShieldAlert, Users, MessageSquare, Star, Search,
  Trash2, Ban, CheckCircle, AlertTriangle, BarChart3, Send,
  Settings, Power, Unlock, BellRing, Server, AlertCircle, Megaphone, History, Layers, FileText, Image, Radio, Menu, ChevronRight,
  Globe, ShoppingBag, Lightbulb, Activity, ExternalLink
} from 'lucide-react';

const navItems = [
  { value: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'moderator'] },
  { value: 'reports', label: 'User Reports', icon: ShieldAlert, roles: ['admin', 'moderator'], badge: 'reports' },
  { value: 'suggestions', label: 'Suggestions', icon: Lightbulb, roles: ['admin', 'moderator'], badge: 'suggestions' },
  { value: 'pending', label: 'Forum Moderation', icon: MessageSquare, roles: ['admin', 'moderator'], badge: 'posts' },
  { value: 'submissions', label: 'Submissions', icon: Globe, roles: ['admin', 'moderator'], badge: 'posts' },
  { value: 'languages', label: 'Languages', icon: Globe, roles: ['admin'] },
  { value: 'users', label: 'Users', icon: Users, roles: ['admin', 'moderator'] },
  { value: 'comments', label: 'Comments', icon: MessageSquare, roles: ['admin', 'moderator'] },
  { value: 'content', label: 'Content', icon: Layers, roles: ['admin', 'moderator'] },
  { value: 'watchrooms', label: 'Watch Rooms', icon: Radio, roles: ['admin', 'moderator'] },
  { value: 'moderation', label: 'Staff Activity', icon: History, roles: ['admin', 'moderator'] },
  { value: 'logs', label: 'Staff Logs', icon: FileText, roles: ['admin', 'moderator'] },
  { value: 'popups', label: 'Popups & Ads', icon: Megaphone, roles: ['admin'] },
  { value: 'incidents', label: 'Incidents', icon: AlertCircle, roles: ['admin'] },
  { value: 'changelog', label: 'Changelog', icon: History, roles: ['admin'] },
  { value: 'servers', label: 'Video Servers', icon: Server, roles: ['admin'] },
  { value: 'settings', label: 'System', icon: Settings, roles: ['admin'] },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const { isAdmin, isModerator, profile, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [messageTitle, setMessageTitle] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messagingUserId, setMessagingUserId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [showBanModal, setShowBanModal] = useState(false);
  const [userToBan, setUserToBan] = useState<string | null>(null);
  const role = isAdmin ? 'admin' : isModerator ? 'moderator' : null;
  const availableNavItems = navItems.filter(item => item.roles.includes(role as any));
  const [activeTab, setActiveTab] = useState(availableNavItems[0]?.value || 'analytics');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [viewingActivityUserId, setViewingActivityUserId] = useState<string | null>(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const { deleteMessage } = useAdminMessages();

  const isStaff = isAdmin || isModerator;

  // Redirect if not staff
  useEffect(() => {
    if (!isLoading && !isStaff) {
      navigate('/');
    }
  }, [isLoading, isStaff, navigate]);

  if (!isLoading && !isStaff) {
    return null;
  }

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

  // Fetch users
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: isStaff,
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

  // Fetch all comments
  const { data: comments, isLoading: loadingComments } = useQuery({
    queryKey: ['admin_comments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (!data || data.length === 0) return [];

      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      return data.map(c => ({
        ...c,
        profile: profileMap.get(c.user_id),
      }));
    },
    enabled: isStaff,
  });

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
      queryClient.invalidateQueries({ queryKey: ['admin_comments'] });
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

  // Ban user mutation
  const banUser = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      // Use the SQL RPC function for banning
      const { error } = await supabase.rpc('ban_user', {
        target_user_id: userId,
        reason: reason,
        duration_hours: null // null = permanent ban
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      toast.success('User banned successfully');
      setShowBanModal(false);
      setBanReason('');
      setUserToBan(null);
    },
    onError: (error: any) => {
      console.error('Ban error:', error);
      toast.error(error.message || 'Failed to ban user');
    },
  });

  // Unban user mutation
  const unbanUser = useMutation({
    mutationFn: async (userId: string) => {
      // Use the SQL RPC function for unbanning
      const { error } = await supabase.rpc('unban_user', {
        target_user_id: userId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      toast.success('User unbanned successfully');
    },
    onError: (error: any) => {
      console.error('Unban error:', error);
      toast.error(error.message || 'Failed to unban user');
    },
  });

  // Toggle admin status mutation
  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      const { error } = await (supabase
        .from('profiles')
        .update({ is_admin: makeAdmin } as any)
        .eq('user_id', userId) as any);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      toast.success(variables.makeAdmin ? 'User promoted to admin' : 'Admin privileges revoked');
    },
    onError: () => {
      toast.error('Failed to update admin status');
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
      setSelectedUserId(null);
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

  // Toggle moderator status mutation
  const toggleModerator = useMutation({
    mutationFn: async ({ userId, makeModerator }: { userId: string; makeModerator: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role: makeModerator ? 'moderator' : 'user' } as any)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      toast.success(variables.makeModerator ? 'User promoted to moderator' : 'Moderator privileges revoked');
    },
    onError: () => {
      toast.error('Failed to update moderator status');
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

  const filteredUsers = users?.filter(u =>
    u.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold">Admin Dashboard</h1>
                <p className="text-sm text-muted-foreground">Manage users and content</p>
              </div>
            </div>
          </div>



        </div >

        {/* Stats */}
        < div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" >
          <GlassPanel className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalUsersCount ?? (users?.length || 0)}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </div>
          </GlassPanel>
          <GlassPanel className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/20">
                <MessageSquare className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{comments?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Comments</p>
              </div>
            </div>
          </GlassPanel>
          <GlassPanel className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/20">
                <Ban className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users?.filter((u: any) => u.is_banned).length || 0}</p>
                <p className="text-xs text-muted-foreground">Banned Users</p>
              </div>
            </div>
          </GlassPanel>
          <GlassPanel className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${maintenanceMode?.is_active ? 'bg-orange-500/20' : 'bg-emerald-500/20'}`}>
                <Power className={`w-5 h-5 ${maintenanceMode?.is_active ? 'text-orange-500' : 'text-emerald-500'}`} />
              </div>
              <div>
                <p className="text-sm font-bold">{maintenanceMode?.is_active ? 'Maintenance' : 'Online'}</p>
                <p className="text-xs text-muted-foreground">System Status</p>
              </div>
            </div>
          </GlassPanel>
        </div >

        {/* Main Content with Left Navigation */}
        < Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col md:flex-row gap-8 relative" >
          {/* Mobile Navigation Toggle */}
          < div className="md:hidden mb-6" >
            <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full justify-between h-14 px-6 bg-card/40 border-white/5 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <Menu className="w-5 h-5 text-primary" />
                    <span className="font-bold">Dashboard Menu</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0 border-white/5 bg-background/95 backdrop-blur-xl">
                <SheetHeader className="p-6 border-b border-white/5 text-left">
                  <SheetTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Admin Panel
                  </SheetTitle>
                </SheetHeader>
                <div className="p-4 overflow-y-auto max-h-[calc(100vh-80px)]">
                  <TabsList className="flex flex-col h-auto bg-transparent border-0 gap-1 p-0 w-full">
                    {availableNavItems.map((item) => (
                      <TabsTrigger
                        key={item.value}
                        value={item.value}
                        onClick={() => setIsMenuOpen(false)}
                        className="justify-start gap-3 px-4 py-3.5 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all flex-shrink-0"
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </SheetContent>
            </Sheet>
          </div >

          {/* Navigation Sidebar */}
          < div className="hidden md:block md:w-64 lg:w-72 flex-shrink-0" >
            <GlassPanel className="p-3 sticky top-6 overflow-x-auto no-scrollbar md:overflow-visible">
              <TabsList className="flex flex-row md:flex-col h-auto bg-transparent border-0 gap-1 p-0 w-max md:w-full">
                {availableNavItems.map((item) => {
                  const badgeCount = item.badge ? (badgeCounts as any)?.[item.badge] : 0;
                  return (
                    <TabsTrigger
                      key={item.value}
                      value={item.value}
                      className="justify-start gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all flex-shrink-0 relative"
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                      {badgeCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-in zoom-in">
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </GlassPanel>
          </div >

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

            {/* Submissions Tab */}
            <TabsContent value="submissions">
              <MarketplaceManager />
            </TabsContent>

            {/* Languages Tab */}
            <TabsContent value="languages">
              <LanguageManager />
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users">
              <GlassPanel className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Manage Users
                  </h2>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => setShowBroadcastModal(true)}
                      className="flex items-center gap-2 bg-primary hover:bg-primary/90"
                    >
                      <Megaphone className="w-4 h-4" />
                      Broadcast Message
                    </Button>
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-muted/50"
                      />
                    </div>
                  </div>
                </div>

                {loadingUsers ? (
                  <div className="text-center py-12 text-muted-foreground">Loading...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">User</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Username</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Joined</th>
                          <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers?.map((user: any) => (
                          <tr key={user.id} className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${user.is_banned ? 'opacity-60' : ''}`}>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <Link to={`/@${user.username || user.id}`} className="block group shrink-0">
                                  {user.avatar_url ? (
                                    <div className="w-10 h-10 rounded-full border-2 border-primary/20 overflow-hidden transition-transform group-hover:scale-105">
                                      <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                                    </div>
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-bold text-primary-foreground group-hover:scale-105 transition-transform">
                                      {user.display_name?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                  )}
                                </Link>
                                <div className="min-w-0">
                                  <Link to={`/@${user.username || user.id}`} className="font-medium hover:text-primary transition-colors block truncate">
                                    {user.display_name || 'Unknown'}
                                  </Link>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {user.is_admin && (
                                      <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider">Admin</span>
                                    )}
                                    {user.role === 'moderator' && (
                                      <span className="px-1.5 py-0.5 rounded bg-secondary/20 text-secondary text-[10px] font-bold uppercase tracking-wider">Moderator</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-muted-foreground font-mono text-xs">
                                {user.username ? `@${user.username}` : '-'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-1">
                                {user.is_banned ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/20 text-destructive text-[10px] font-bold uppercase tracking-wider w-fit">
                                    <Ban className="w-3 h-3" /> Banned
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase tracking-wider w-fit">
                                    <CheckCircle className="w-3 h-3" /> Active
                                  </span>
                                )}
                                {user.last_seen && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <div className={`w-1.5 h-1.5 rounded-full ${new Date().getTime() - new Date(user.last_seen).getTime() < 300000
                                      ? 'bg-emerald-500 animate-pulse'
                                      : 'bg-muted-foreground/30'
                                      }`} />
                                    {new Date().getTime() - new Date(user.last_seen).getTime() < 300000
                                      ? 'Online'
                                      : `Last seen ${formatDistanceToNow(new Date(user.last_seen), { addSuffix: true })}`}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground text-sm">
                              {formatDate(user.created_at)}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-2">
                                {isAdmin && (
                                  <>
                                    {/* Moderator toggle button */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleModerator.mutate({ userId: user.user_id, makeModerator: user.role !== 'moderator' })}
                                      disabled={toggleModerator.isPending || user.is_admin}
                                      className={user.role === 'moderator' ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-primary"}
                                      title={user.role === 'moderator' ? "Remove moderator" : "Make moderator"}
                                    >
                                      {user.role === 'moderator' ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                                    </Button>
                                    {/* Admin toggle button */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleAdmin.mutate({ userId: user.user_id, makeAdmin: !user.is_admin })}
                                      disabled={toggleAdmin.isPending}
                                      className={user.is_admin ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-primary"}
                                      title={user.is_admin ? "Remove admin" : "Make admin"}
                                    >
                                      {user.is_admin ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                                    </Button>
                                  </>
                                )}
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setMessagingUserId(user.user_id)}
                                    className="text-primary hover:text-primary hover:bg-primary/10"
                                    title="Send direct message"
                                  >
                                    <Send className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setViewingActivityUserId(user.user_id)}
                                  className="text-secondary hover:text-secondary hover:bg-secondary/10"
                                  title="View Activity"
                                >
                                  <Activity className="w-4 h-4" />
                                </Button>
                                {user.is_banned ? (
                                  isAdmin && !user.is_admin && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => unbanUser.mutate(user.user_id)}
                                      disabled={unbanUser.isPending}
                                      className="text-emerald-500 hover:text-emerald-500"
                                      title="Unban user"
                                    >
                                      <Unlock className="w-4 h-4" />
                                    </Button>
                                  )
                                ) : (
                                  (isAdmin || isModerator) && !user.is_admin && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setUserToBan(user.user_id);
                                        setShowBanModal(true);
                                      }}
                                      disabled={banUser.isPending}
                                      className="text-destructive hover:text-destructive"
                                      title="Ban user"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </Button>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </GlassPanel>
            </TabsContent>

            {/* Comments Tab */}
            <TabsContent value="comments">
              <GlassPanel className="p-6">
                <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Recent Comments
                </h2>

                {loadingComments ? (
                  <div className="text-center py-12 text-muted-foreground">Loading...</div>
                ) : comments && comments.length > 0 ? (
                  <div className="space-y-4">
                    {comments.map((comment: any) => (
                      <div
                        key={comment.id}
                        className="p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium">
                                {comment.profile?.display_name || 'Unknown'}
                              </span>
                              {comment.is_spoiler && (
                                <span className="px-2 py-0.5 rounded-full bg-orange/20 text-orange text-xs">
                                  Spoiler
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatDate(comment.created_at)}
                              </span>
                            </div>
                            <p className="text-sm text-foreground/80 mb-2">{comment.content}</p>
                            <p className="text-xs text-muted-foreground">
                              Anime: {comment.anime_id}
                              {comment.episode_id && ` • Episode`}
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

            {/* Custom Sources Tab */}
            <TabsContent value="custom-sources">
              <GlassPanel className="p-6">
                <CustomSourceManager />
              </GlassPanel>
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
                            onChange={(e) => setSelectedUserId(e.target.value === 'all' ? null : 'search')}
                          >
                            <option value="all">Broadcast (All Users)</option>
                            <option value="individual">Specific User</option>
                          </select>
                        </div>
                        {selectedUserId === 'search' && (
                          <div>
                            <label className="text-sm font-medium mb-1.5 block">User ID / Username</label>
                            <Input placeholder="Enter ID..." className="bg-muted/30" />
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={() => sendMessage.mutate({
                          title: messageTitle,
                          content: messageContent,
                          recipientId: selectedUserId === 'search' ? null : null // Needs proper ID lookup
                        })}
                        disabled={sendMessage.isPending || !messageTitle || !messageContent}
                        className="w-full gap-2"
                      >
                        <Send className="w-4 h-4" />
                        {sendMessage.isPending ? 'Sending...' : 'Send Broadcast'}
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
                                onClick={() => {
                                  if (confirm('Delete this notification?')) deleteMessage.mutate(msg.id);
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

            {/* Video Servers Tab */}
            <TabsContent value="servers">
              <GlassPanel className="p-6">
                <VideoServerManager />
              </GlassPanel>
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

        {/* Ban Modal */}
        {
          showBanModal && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <GlassPanel className="p-6 max-w-md w-full">
                <h3 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
                  <Ban className="w-5 h-5 text-destructive" />
                  Ban User
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Reason for ban</label>
                    <Textarea
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      placeholder="Enter reason for banning this user..."
                      className="bg-muted/50"
                    />
                  </div>
                  <div className="flex gap-3 justify-end">
                    <Button variant="ghost" onClick={() => { setShowBanModal(false); setUserToBan(null); }}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => userToBan && banUser.mutate({ userId: userToBan, reason: banReason })}
                      disabled={banUser.isPending}
                    >
                      {banUser.isPending ? 'Banning...' : 'Ban User'}
                    </Button>
                  </div>
                </div>
              </GlassPanel>
            </div>
          )
        }
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

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <GlassPanel className="p-6 max-w-md w-full">
            <h3 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              Broadcast Message to All Users
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Title</label>
                <Input
                  placeholder="Enter broadcast title..."
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Message</label>
                <Textarea
                  placeholder="Enter your message to all users..."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="mt-1 min-h-[120px]"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="ghost" onClick={() => {
                  setShowBroadcastModal(false);
                  setBroadcastTitle('');
                  setBroadcastMessage('');
                }}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      // Get all users for notification
                      const { data: users } = await supabase
                        .from('profiles')
                        .select('user_id')
                        .neq('is_banned', true);
                      
                      if (!users || users.length === 0) {
                        toast.error('No users found to notify');
                        return;
                      }
                      
                      // Create notifications for all users
                      const notifications = users.map(user => ({
                        user_id: user.user_id,
                        title: broadcastTitle,
                        body: broadcastMessage,
                        data: { type: 'broadcast', sent_by: profile?.id || 'admin' },
                        read: false,
                        created_at: new Date().toISOString()
                      }));
                      
                      const { error } = await supabase
                        .from('notifications')
                        .insert(notifications);
                      
                      if (error) throw error;
                      
                      // Invalidate all notification queries to refresh for all users
                      queryClient.invalidateQueries({ queryKey: ['notifications'] });
                      
                      toast.success(`Broadcast notification sent to ${users.length} users!`);
                      setShowBroadcastModal(false);
                      setBroadcastTitle('');
                      setBroadcastMessage('');
                    } catch (error) {
                      console.error('Error sending broadcast notification:', error);
                      toast.error('Failed to send broadcast notification');
                    }
                  }}
                  disabled={!broadcastTitle || !broadcastMessage}
                >
                  Send Broadcast Notification
                </Button>
              </div>
            </div>
          </GlassPanel>
        </div>
      )}
    </div >
  );
}
