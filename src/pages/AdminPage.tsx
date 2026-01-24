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
import { NotificationsManager } from '@/components/admin/NotificationsManager';
import {
  ArrowLeft, Shield, ShieldCheck, ShieldOff, ShieldAlert, Users, MessageSquare, Star, Search,
  Trash2, Ban, CheckCircle, AlertTriangle, BarChart3, Send,
  Settings, Power, Unlock, BellRing, Server, AlertCircle, Megaphone, History, Layers, FileText, Image, Radio, Menu, ChevronRight, Bell
} from 'lucide-react';

// Type definitions for Supabase tables
interface MaintenanceMode {
  id: string;
  is_active: boolean;
  message: string;
  enabled_at?: string;
  enabled_by?: string;
  updated_at?: string;
}

interface Profile {
  id: string;
  user_id: string;
  username?: string;
  display_name?: string;
  is_admin?: boolean;
  is_banned?: boolean;
  banned_at?: string;
  banned_by?: string;
  ban_reason?: string;
  created_at: string;
}

interface Comment {
  id: string;
  user_id: string;
  anime_id: string;
  episode_id?: string;
  content: string;
  is_spoiler?: boolean;
  created_at: string;
  profile?: {
    user_id: string;
    display_name?: string;
  };
}

interface AdminMessage {
  id: string;
  title: string;
  content: string;
  message_type: 'individual' | 'broadcast';
  recipient_id?: string;
  sender_id?: string;
  created_at: string;
}

const navItems = [
  { value: 'analytics', label: 'Analytics', icon: BarChart3 },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'users', label: 'Users', icon: Users },
  { value: 'comments', label: 'Comments', icon: MessageSquare },
  { value: 'content', label: 'Content', icon: Layers },
  { value: 'incidents', label: 'Incidents', icon: AlertCircle },
  { value: 'changelog', label: 'Changelog', icon: History },
  { value: 'logs', label: 'Admin Logs', icon: FileText },
  { value: 'pending', label: 'Pending Items', icon: Image },
  { value: 'watchrooms', label: 'Watch Rooms', icon: Radio },
  { value: 'custom-sources', label: 'Custom Sources', icon: ShieldAlert },
  { value: 'moderation', label: 'Moderation', icon: ShieldAlert },
  { value: 'settings', label: 'System Settings', icon: Settings },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [messageTitle, setMessageTitle] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [showBanModal, setShowBanModal] = useState(false);
  const [userToBan, setUserToBan] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('analytics');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Redirect if not admin - use useEffect to avoid setState-during-render
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/');
    }
  }, [isLoading, isAdmin, navigate]);

  // Return early if not admin (after useEffect runs)
  if (!isLoading && !isAdmin) {
    return null;
  }

  // Fetch maintenance mode
  const { data: maintenanceMode } = useQuery<MaintenanceMode | null>({
    queryKey: ['maintenance_mode'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_mode')
        .select('*')
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  // Fetch users
  const { data: users, isLoading: loadingUsers } = useQuery<Profile[]>({
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

      const userIds = [...new Set(data.map((c: any) => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) || []);

      return data.map((c: any) => ({
        ...c,
        profile: profileMap.get(c.user_id),
      }));
    },
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
  });

  // Ban user mutation
  const banUser = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const { data: currentUser } = await supabase.auth.getUser();
      // Using type assertion since the columns may not be in generated types yet
      const { error } = await (supabase
        .from('profiles')
        .update({
          is_banned: true,
          banned_at: new Date().toISOString(),
          banned_by: currentUser.user?.id,
          ban_reason: reason,
        } as any)
        .eq('user_id', userId) as any);
      if (error) throw error;
    },
  });

  // Unban user mutation
  const unbanUser = useMutation({
    mutationFn: async (userId: string) => {
      // Using type assertion since the columns may not be in generated types yet
      const { error } = await (supabase
        .from('profiles')
        .update({
          is_banned: false,
          banned_at: null,
          banned_by: null,
          ban_reason: null,
        } as any)
        .eq('user_id', userId) as any);
      if (error) throw error;
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
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
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

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <GlassPanel className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users?.length || 0}</p>
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
        </div>

        {/* Main Content with Left Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col md:flex-row gap-8 relative">
          {/* Mobile Navigation Toggle */}
          <div className="md:hidden mb-6">
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
                    {navItems.map((item) => (
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
          </div>

          {/* Navigation Sidebar */}
          <div className="hidden md:block md:w-64 lg:w-72 flex-shrink-0">
            <GlassPanel className="p-3 sticky top-6 overflow-x-auto no-scrollbar md:overflow-visible">
              <TabsList className="flex flex-row md:flex-col h-auto bg-transparent border-0 gap-1 p-0 w-max md:w-full">
                {navItems.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="justify-start gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all flex-shrink-0"
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </GlassPanel>
          </div>

          <div className="flex-1 min-w-0">

            {/* Notifications Tab */}
            <TabsContent value="notifications">
              <GlassPanel className="p-6">
                <NotificationsManager />
              </GlassPanel>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics">
              <AnalyticsDashboard />
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users">
              <GlassPanel className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Manage Users
                  </h2>
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
                          <tr key={user.id} className={`border-b border-border/30 hover:bg-muted/30 ${user.is_banned ? 'opacity-60' : ''}`}>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-bold text-primary-foreground">
                                  {user.display_name?.[0]?.toUpperCase() || 'U'}
                                </div>
                                <div>
                                  <span className="font-medium">{user.display_name || 'Unknown'}</span>
                                  {user.is_admin && (
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs">Admin</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {user.username ? `@${user.username}` : '-'}
                            </td>
                            <td className="py-3 px-4">
                              {user.is_banned ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-destructive/20 text-destructive text-xs font-medium">
                                  <Ban className="w-3 h-3" /> Banned
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-500 text-xs font-medium">
                                  <CheckCircle className="w-3 h-3" /> Active
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground text-sm">
                              {formatDate(user.created_at)}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-2">
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
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedUserId(user.user_id)}
                                  className="text-primary hover:text-primary"
                                  title="Send message"
                                >
                                  <Send className="w-4 h-4" />
                                </Button>
                                {user.is_banned ? (
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
                                ) : !user.is_admin && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setUserToBan(user.user_id);
                                      setShowBanModal(true);
                                    }}
                                    className="text-destructive hover:text-destructive"
                                    title="Ban user"
                                  >
                                    <Ban className="w-4 h-4" />
                                  </Button>
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
        </Tabs>

        {/* Ban Modal */}
        {showBanModal && (
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
        )}
      </main>

    </div>
  );
}
