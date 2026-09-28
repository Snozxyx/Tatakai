import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { deriveIsAdmin, deriveIsModerator } from '@/lib/roles';
import { BulkBanToolbar } from '@/components/admin/BulkBanToolbar';
import {
  Users, Megaphone, Search, Ban, CheckCircle, Shield, ShieldCheck, ShieldOff,
  Send, Activity, UserCog, Unlock,
} from 'lucide-react';

const USERS_PER_PAGE = 50;

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * The "Users" section of the admin dashboard: the searchable, paged user table
 * plus the two modals it owns (ban, broadcast). Direct-messaging and activity
 * viewing are surfaced through `onMessageUser` / `onViewActivity` because those
 * panels live at the page root and share compose state with the Notifications
 * tab.
 */
export function UserManagementTab({
  onMessageUser,
  onViewActivity,
}: {
  onMessageUser: (userId: string) => void;
  onViewActivity: (userId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, isModerator, profile } = useAuth();
  const isStaff = isAdmin || isModerator;

  const [searchTerm, setSearchTerm] = useState('');
  // Server-side user search/pagination. The list query used to `.limit(100)` and
  // filter client-side, so the panel silently only ever saw the 100 newest
  // accounts. Search now runs in Postgres and results are paged.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [userPage, setUserPage] = useState(0);
  const [banReason, setBanReason] = useState('');
  const [showBanModal, setShowBanModal] = useState(false);
  const [userToBan, setUserToBan] = useState<string | null>(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<{ id: string; display_name: string }[]>([]);

  // Debounce the search box and reset to the first page whenever the term
  // changes, so each keystroke doesn't fire a query and paging can't land the
  // viewer on an out-of-range page for a narrower result set.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setUserPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [searchTerm]);

  // Fetch users — server-side search + pagination (see USERS_PER_PAGE). Returns
  // the page rows plus the total count for the matching set, so the pager and
  // the "N users" label are accurate rather than capped at a fetched slice.
  const { data: usersPage, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin_users', debouncedSearch, userPage],
    queryFn: async () => {
      const from = userPage * USERS_PER_PAGE;
      const to = from + USERS_PER_PAGE - 1;

      let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (debouncedSearch) {
        // Strip the characters PostgREST's `or()` grammar treats specially so a
        // typed name can't alter the filter; `*` is its ilike wildcard.
        const needle = debouncedSearch.replace(/[,()*]/g, ' ').trim();
        if (needle) {
          query = query.or(`display_name.ilike.*${needle}*,username.ilike.*${needle}*`);
        }
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
    enabled: isStaff,
  });

  const users = usersPage?.rows;
  const filteredUsers = users;
  const matchedUsersCount = usersPage?.count ?? 0;
  const userPageCount = Math.max(1, Math.ceil(matchedUsersCount / USERS_PER_PAGE));

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
  //
  // Goes through `set_staff_role` rather than writing `profiles` directly:
  // `authenticated` no longer holds UPDATE on the role columns
  // (20260902000003), and the RPC is admin-only, which is the same gate the
  // buttons below are already wrapped in. It also derives the current role
  // server-side, so a demotion can no longer be computed from a `user.role`
  // that went stale in the cache.
  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      const { error } = await (supabase.rpc('set_staff_role' as any, {
        target_user_id: userId,
        p_role: 'admin',
        p_enabled: makeAdmin,
      } as any) as any);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      toast.success(variables.makeAdmin ? 'User promoted to admin' : 'Admin privileges revoked');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update admin status');
    },
  });

  // Toggle moderator status mutation. See `toggleAdmin` for why this is an RPC.
  const toggleModerator = useMutation({
    mutationFn: async ({ userId, makeModerator }: { userId: string; makeModerator: boolean }) => {
      const { error } = await (supabase.rpc('set_staff_role' as any, {
        target_user_id: userId,
        p_role: 'moderator',
        p_enabled: makeModerator,
      } as any) as any);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      toast.success(variables.makeModerator ? 'User promoted to moderator' : 'Moderator privileges revoked');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update moderator status');
    },
  });

  return (
    <>
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

          {/* Bulk ban toolbar */}
          <BulkBanToolbar
            selectedUsers={selectedUsers}
            onComplete={() => {
              setSelectedUsers([]);
              queryClient.invalidateQueries({ queryKey: ['admin_users'] });
            }}
          />

          {loadingUsers ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground w-10">
                      <input type="checkbox" className="rounded border-white/20"
                        checked={selectedUsers.length > 0 && selectedUsers.length === filteredUsers?.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUsers((filteredUsers ?? []).map((u: any) => ({ id: u.user_id, display_name: u.display_name || u.username || 'Unknown' })));
                          } else {
                            setSelectedUsers([]);
                          }
                        }} />
                    </th>
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
                        <input type="checkbox" className="rounded border-white/20"
                          checked={selectedUsers.some(s => s.id === user.user_id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsers(prev => [...prev, { id: user.user_id, display_name: user.display_name || user.username || 'Unknown' }]);
                            } else {
                              setSelectedUsers(prev => prev.filter(s => s.id !== user.user_id));
                            }
                          }} />
                      </td>
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
                              {deriveIsAdmin(user) && (
                                <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider">Admin</span>
                              )}
                              {deriveIsModerator(user) && !deriveIsAdmin(user) && (
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/admin/user/${user.user_id}`)}
                            className="text-primary hover:text-primary hover:bg-primary/10"
                            title="Manage user"
                          >
                            <UserCog className="w-4 h-4" />
                          </Button>
                          {isAdmin && (() => {
                            // Derived the same way the database does, so the button
                            // state matches the privileges actually in force.
                            const rowIsAdmin = deriveIsAdmin(user);
                            const rowIsModerator = deriveIsModerator(user);
                            return (
                            <>
                              {/* Moderator toggle button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleModerator.mutate({ userId: user.user_id, makeModerator: !rowIsModerator })}
                                disabled={toggleModerator.isPending || rowIsAdmin}
                                className={rowIsModerator ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-primary"}
                                title={rowIsModerator ? "Remove moderator" : "Make moderator"}
                              >
                                {rowIsModerator ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                              </Button>
                              {/* Admin toggle button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleAdmin.mutate({ userId: user.user_id, makeAdmin: !rowIsAdmin })}
                                disabled={toggleAdmin.isPending}
                                className={rowIsAdmin ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-primary"}
                                title={rowIsAdmin ? "Remove admin" : "Make admin"}
                              >
                                {rowIsAdmin ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                              </Button>
                            </>
                            );
                          })()}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onMessageUser(user.user_id)}
                              className="text-primary hover:text-primary hover:bg-primary/10"
                              title="Send direct message"
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewActivity(user.user_id)}
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
            {/* Pager. Total is the matched-set count from the query, so it
                is right whether or not a search is active. */}
            <div className="mt-4 flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">
                {matchedUsersCount.toLocaleString()} {debouncedSearch ? 'matching ' : ''}user{matchedUsersCount === 1 ? '' : 's'}
                {matchedUsersCount > 0 && (
                  <> · page {userPage + 1} of {userPageCount}</>
                )}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUserPage((p) => Math.max(0, p - 1))}
                  disabled={userPage === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUserPage((p) => p + 1)}
                  disabled={userPage + 1 >= userPageCount}
                >
                  Next
                </Button>
              </div>
            </div>
            </>
          )}
        </GlassPanel>
      </TabsContent>
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
    </>
  );
}
