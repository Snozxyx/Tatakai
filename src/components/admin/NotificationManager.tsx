import React, { useState } from 'react';
import { Plus, Bell, Users, Calendar, Send, Edit, Trash2, Eye, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface NotificationFormData {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'announcement';
  priority: number;
  expires_at?: string;
  user_id?: string;
}

interface PopupFormData {
  title: string;
  content: string;
  popup_type: 'info' | 'warning' | 'alert' | 'promotion' | 'maintenance';
  image_url?: string;
  action_url?: string;
  action_label?: string;
  priority: number;
  start_date: string;
  end_date?: string;
  display_frequency: 'once' | 'daily' | 'session' | 'always';
  show_for_guests: boolean;
  show_for_logged_in: boolean;
}

interface NotificationManagerProps {
  className?: string;
}

export function NotificationManager({ className }: NotificationManagerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'notifications' | 'popups' | 'analytics'>('notifications');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NotificationFormData | PopupFormData | null>(null);
  const [formType, setFormType] = useState<'notification' | 'popup'>('notification');

  // Fetch notifications
  const { data: notifications = [] } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          profiles!notifications_user_id_fkey(username, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch popups
  const { data: popups = [] } = useQuery({
    queryKey: ['admin-popups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_popups')
        .select(`
          *,
          profiles!global_popups_created_by_fkey(username, display_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch popup analytics
  const { data: popupAnalytics = [] } = useQuery({
    queryKey: ['popup-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('popup_views')
        .select(`
          popup_id,
          global_popups(title, popup_type),
          viewed_at,
          user_id
        `)
        .order('viewed_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Create notification mutation
  const createNotificationMutation = useMutation({
    mutationFn: async (formData: NotificationFormData) => {
      const { error } = await supabase
        .from('notifications')
        .insert({
          ...formData,
          created_at: new Date().toISOString(),
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      setIsFormOpen(false);
      setEditingItem(null);
    },
  });

  // Create/update popup mutation
  const upsertPopupMutation = useMutation({
    mutationFn: async (formData: PopupFormData) => {
      if (editingItem) {
        const { error } = await supabase
          .from('global_popups')
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingItem.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('global_popups')
          .insert({
            ...formData,
            created_by: user?.id,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-popups'] });
      setIsFormOpen(false);
      setEditingItem(null);
    },
  });

  // Delete notification mutation
  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });

  // Delete popup mutation
  const deletePopupMutation = useMutation({
    mutationFn: async (popupId: string) => {
      const { error } = await supabase
        .from('global_popups')
        .delete()
        .eq('id', popupId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-popups'] });
    },
  });

  const handleSubmit = (formData: NotificationFormData | PopupFormData) => {
    if (formType === 'notification') {
      createNotificationMutation.mutate(formData as NotificationFormData);
    } else {
      upsertPopupMutation.mutate(formData as PopupFormData);
    }
  };

  const NotificationForm = ({ 
    initialData, 
    onSubmit 
  }: { 
    initialData?: NotificationFormData;
    onSubmit: (data: NotificationFormData) => void;
  }) => {
    const [formData, setFormData] = useState<NotificationFormData>({
      title: initialData?.title || '',
      message: initialData?.message || '',
      type: initialData?.type || 'info',
      priority: initialData?.priority || 0,
      expires_at: initialData?.expires_at || '',
      user_id: initialData?.user_id || '',
    });

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as NotificationFormData['type'] }))}
              className="w-full px-3 py-2 border border-border rounded-md"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="success">Success</option>
              <option value="announcement">Announcement</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Message</label>
          <textarea
            value={formData.message}
            onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
            className="w-full px-3 py-2 border border-border rounded-md"
            rows={3}
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <input
              type="number"
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-border rounded-md"
              min="0"
              max="10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">User ID (optional)</label>
            <input
              type="text"
              value={formData.user_id}
              onChange={(e) => setFormData(prev => ({ ...prev, user_id: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
              placeholder="UUID"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Expires At</label>
            <input
              type="datetime-local"
              value={formData.expires_at}
              onChange={(e) => setFormData(prev => ({ ...prev, expires_at: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setIsFormOpen(false);
              setEditingItem(null);
            }}
            className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(formData)}
            disabled={createNotificationMutation.isPending}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {initialData ? 'Update' : 'Create'} Notification
          </button>
        </div>
      </div>
    );
  };

  const PopupForm = ({ 
    initialData, 
    onSubmit 
  }: { 
    initialData?: PopupFormData;
    onSubmit: (data: PopupFormData) => void;
  }) => {
    const [formData, setFormData] = useState<PopupFormData>({
      title: initialData?.title || '',
      content: initialData?.content || '',
      popup_type: initialData?.popup_type || 'info',
      image_url: initialData?.image_url || '',
      action_url: initialData?.action_url || '',
      action_label: initialData?.action_label || '',
      priority: initialData?.priority || 0,
      start_date: initialData?.start_date || new Date().toISOString().slice(0, 16),
      end_date: initialData?.end_date || '',
      display_frequency: initialData?.display_frequency || 'once',
      show_for_guests: initialData?.show_for_guests ?? true,
      show_for_logged_in: initialData?.show_for_logged_in ?? true,
    });

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={formData.popup_type}
              onChange={(e) => setFormData(prev => ({ ...prev, popup_type: e.target.value as 'info' | 'warning' | 'alert' | 'promotion' | 'maintenance' }))}
              className="w-full px-3 py-2 border border-border rounded-md"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="alert">Alert</option>
              <option value="promotion">Promotion</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Content (HTML allowed)</label>
          <textarea
            value={formData.content}
            onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
            className="w-full px-3 py-2 border border-border rounded-md"
            rows={4}
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Image URL (optional)</label>
            <input
              type="url"
              value={formData.image_url}
              onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Action URL (optional)</label>
            <input
              type="url"
              value={formData.action_url}
              onChange={(e) => setFormData(prev => ({ ...prev, action_url: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Action Label</label>
            <input
              type="text"
              value={formData.action_label}
              onChange={(e) => setFormData(prev => ({ ...prev, action_label: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
              placeholder="Click here"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <input
              type="number"
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-border rounded-md"
              min="0"
              max="10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="datetime-local"
              value={formData.start_date}
              onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">End Date (optional)</label>
            <input
              type="datetime-local"
              value={formData.end_date}
              onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Frequency</label>
            <select
              value={formData.display_frequency}
              onChange={(e) => setFormData(prev => ({ ...prev, display_frequency: e.target.value as 'once' | 'daily' | 'session' | 'always' }))}
              className="w-full px-3 py-2 border border-border rounded-md"
            >
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="session">Per Session</option>
              <option value="always">Always</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.show_for_guests}
              onChange={(e) => setFormData(prev => ({ ...prev, show_for_guests: e.target.checked }))}
              className="rounded border-border"
            />
            <span className="text-sm">Show for guests</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.show_for_logged_in}
              onChange={(e) => setFormData(prev => ({ ...prev, show_for_logged_in: e.target.checked }))}
              className="rounded border-border"
            />
            <span className="text-sm">Show for logged-in users</span>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setIsFormOpen(false);
              setEditingItem(null);
            }}
            className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(formData)}
            disabled={upsertPopupMutation.isPending}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {initialData ? 'Update' : 'Create'} Popup
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Notification Management</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setFormType('notification');
              setIsFormOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Bell className="h-4 w-4" />
            Send Notification
          </button>
          <button
            onClick={() => {
              setFormType('popup');
              setIsFormOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            <Users className="h-4 w-4" />
            Create Popup
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-muted rounded-lg p-1">
        <button
          onClick={() => setActiveTab('notifications')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors",
            activeTab === 'notifications' ? "bg-background shadow-sm" : "hover:bg-background/50"
          )}
        >
          <Bell className="h-4 w-4" />
          Notifications
        </button>
        <button
          onClick={() => setActiveTab('popups')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors",
            activeTab === 'popups' ? "bg-background shadow-sm" : "hover:bg-background/50"
          )}
        >
          <Users className="h-4 w-4" />
          Popups
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors",
            activeTab === 'analytics' ? "bg-background shadow-sm" : "hover:bg-background/50"
          )}
        >
          <BarChart3 className="h-4 w-4" />
          Analytics
        </button>
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setIsFormOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-background border border-border rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">
                {formType === 'notification' ? 'Create Notification' : 'Create Popup'}
              </h3>
              {formType === 'notification' ? (
                <NotificationForm
                  initialData={editingItem}
                  onSubmit={handleSubmit}
                />
              ) : (
                <PopupForm
                  initialData={editingItem}
                  onSubmit={handleSubmit}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="space-y-4">
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Recent Notifications</h3>
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No notifications sent yet
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{notification.title}</span>
                        <span className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          notification.type === 'info' && "bg-blue-100 text-blue-800",
                          notification.type === 'warning' && "bg-yellow-100 text-yellow-800",
                          notification.type === 'error' && "bg-red-100 text-red-800",
                          notification.type === 'success' && "bg-green-100 text-green-800",
                          notification.type === 'announcement' && "bg-purple-100 text-purple-800"
                        )}>
                          {notification.type}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{notification.message}</p>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(notification.created_at).toLocaleString()}
                        {notification.user_id && (
                          <span className="ml-2">
                            to {notification.profiles?.username || notification.profiles?.display_name || 'Unknown User'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingItem(notification);
                          setFormType('notification');
                          setIsFormOpen(true);
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteNotificationMutation.mutate(notification.id)}
                        className="p-1 text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'popups' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Global Popups</h3>
            {popups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No popups created yet
              </div>
            ) : (
              <div className="space-y-2">
                {popups.map((popup) => (
                  <div
                    key={popup.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{popup.title}</span>
                        <span className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          popup.popup_type === 'info' && "bg-blue-100 text-blue-800",
                          popup.popup_type === 'warning' && "bg-yellow-100 text-yellow-800",
                          popup.popup_type === 'alert' && "bg-red-100 text-red-800",
                          popup.popup_type === 'promotion' && "bg-green-100 text-green-800",
                          popup.popup_type === 'maintenance' && "bg-purple-100 text-purple-800"
                        )}>
                          {popup.popup_type}
                        </span>
                        {!popup.is_active && (
                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div 
                        className="text-sm text-muted-foreground prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: popup.content.substring(0, 200) + (popup.content.length > 200 ? '...' : '') }}
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Priority: {popup.priority} • 
                        Frequency: {popup.display_frequency} •
                        {popup.show_for_guests && ' Guests'} 
                        {popup.show_for_logged_in && ' Logged-in'} •
                        {new Date(popup.start_date).toLocaleDateString()}
                        {popup.end_date && ` - ${new Date(popup.end_date).toLocaleDateString()}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingItem(popup);
                          setFormType('popup');
                          setIsFormOpen(true);
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deletePopupMutation.mutate(popup.id)}
                        className="p-1 text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Popup Analytics</h3>
            {popupAnalytics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No popup views yet
              </div>
            ) : (
              <div className="space-y-2">
                {popupAnalytics.map((view) => (
                  <div
                    key={view.popup_id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{view.global_popups?.title}</span>
                        <span className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          view.global_popups?.popup_type === 'info' && "bg-blue-100 text-blue-800",
                          view.global_popups?.popup_type === 'warning' && "bg-yellow-100 text-yellow-800",
                          view.global_popups?.popup_type === 'alert' && "bg-red-100 text-red-800",
                          view.global_popups?.popup_type === 'promotion' && "bg-green-100 text-green-800",
                          view.global_popups?.popup_type === 'maintenance' && "bg-purple-100 text-purple-800"
                        )}>
                          {view.global_popups?.popup_type}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Viewed on {new Date(view.viewed_at).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        User: {view.user_id || 'Guest'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}