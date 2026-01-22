import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ============================================
// STATUS INCIDENTS
// ============================================

export interface StatusIncident {
  id: string;
  title: string;
  description: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  severity: 'minor' | 'major' | 'critical';
  affected_services: string[];
  is_active: boolean;
  created_by: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  updates?: StatusIncidentUpdate[];
}

export interface StatusIncidentUpdate {
  id: string;
  incident_id: string;
  message: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  created_by: string;
  created_at: string;
}

export function useStatusIncidents(activeOnly = true) {
  return useQuery({
    queryKey: ['status_incidents', activeOnly],
    queryFn: async () => {
      let query = supabase
        .from('status_incidents')
        .select('*')
        .order('created_at', { ascending: false });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch updates for each incident
      if (data && data.length > 0) {
        const { data: updates } = await supabase
          .from('status_incident_updates')
          .select('*')
          .in('incident_id', data.map(i => i.id))
          .order('created_at', { ascending: false });

        const updatesMap = new Map<string, StatusIncidentUpdate[]>();
        updates?.forEach(u => {
          if (!updatesMap.has(u.incident_id)) {
            updatesMap.set(u.incident_id, []);
          }
          updatesMap.get(u.incident_id)!.push(u);
        });

        return data.map(incident => ({
          ...incident,
          updates: updatesMap.get(incident.id) || [],
        })) as StatusIncident[];
      }

      return data as StatusIncident[];
    },
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (incident: {
      title: string;
      description: string;
      status: StatusIncident['status'];
      severity: StatusIncident['severity'];
      affected_services?: string[];
    }) => {
      if (!user) throw new Error('Must be logged in');

      const { data, error } = await supabase
        .from('status_incidents')
        .insert({
          ...incident,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status_incidents'] });
    },
  });
}

export function useUpdateIncident() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      incidentId,
      updates,
      updateMessage,
    }: {
      incidentId: string;
      updates: Partial<StatusIncident>;
      updateMessage?: string;
    }) => {
      if (!user) throw new Error('Must be logged in');

      // Update incident
      const { error: updateError } = await supabase
        .from('status_incidents')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
          resolved_at: updates.status === 'resolved' ? new Date().toISOString() : undefined,
          is_active: updates.status !== 'resolved',
        })
        .eq('id', incidentId);

      if (updateError) throw updateError;

      // Add update message if provided
      if (updateMessage && updates.status) {
        const { error: msgError } = await supabase
          .from('status_incident_updates')
          .insert({
            incident_id: incidentId,
            message: updateMessage,
            status: updates.status,
            created_by: user.id,
          });

        if (msgError) throw msgError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status_incidents'] });
    },
  });
}

// ============================================
// POPUPS / BANNERS
// ============================================

export interface Popup {
  id: string;
  title: string;
  content: string | null;
  popup_type: 'banner' | 'modal' | 'toast' | 'fullscreen';
  background_color: string;
  text_color: string;
  accent_color: string;
  image_url: string | null;
  action_text: string | null;
  action_url: string | null;
  dismiss_text: string;
  target_pages: string[];
  target_user_type: 'all' | 'guests' | 'logged_in' | 'premium';
  show_on_mobile: boolean;
  show_on_desktop: boolean;
  start_date: string | null;
  end_date: string | null;
  frequency: 'once' | 'always' | 'daily' | 'weekly';
  priority: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function useActivePopups() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['active_popups', user?.id],
    queryFn: async () => {
      const now = new Date().toISOString();
      
      const query = supabase
        .from('popups')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      // Filter by date range
      const filtered = (data || []).filter(popup => {
        if (popup.start_date && new Date(popup.start_date) > new Date(now)) return false;
        if (popup.end_date && new Date(popup.end_date) < new Date(now)) return false;
        
        // Check user type
        if (popup.target_user_type === 'guests' && user) return false;
        if (popup.target_user_type === 'logged_in' && !user) return false;
        
        return true;
      });

      // Check dismissals
      if (user && filtered.length > 0) {
        const { data: dismissals } = await supabase
          .from('popup_dismissals')
          .select('popup_id, dismissed_at')
          .eq('user_id', user.id)
          .in('popup_id', filtered.map(p => p.id));

        const dismissedMap = new Map(dismissals?.map(d => [d.popup_id, new Date(d.dismissed_at)]) || []);

        return filtered.filter(popup => {
          const dismissedAt = dismissedMap.get(popup.id);
          if (!dismissedAt) return true;

          // Check frequency
          const now = new Date();
          switch (popup.frequency) {
            case 'once':
              return false; // Already dismissed
            case 'always':
              return true; // Always show
            case 'daily':
              return (now.getTime() - dismissedAt.getTime()) > 24 * 60 * 60 * 1000;
            case 'weekly':
              return (now.getTime() - dismissedAt.getTime()) > 7 * 24 * 60 * 60 * 1000;
            default:
              return true;
          }
        }) as Popup[];
      }

      return filtered as Popup[];
    },
  });
}

export function useAdminPopups() {
  return useQuery({
    queryKey: ['admin_popups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('popups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Popup[];
    },
  });
}

export function useCreatePopup() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (popup: Omit<Popup, 'id' | 'created_by' | 'created_at' | 'updated_at'>) => {
      if (!user) throw new Error('Must be logged in');

      const { data, error } = await supabase
        .from('popups')
        .insert({
          ...popup,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_popups'] });
      queryClient.invalidateQueries({ queryKey: ['active_popups'] });
    },
  });
}

export function useUpdatePopup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Popup> }) => {
      const { error } = await supabase
        .from('popups')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_popups'] });
      queryClient.invalidateQueries({ queryKey: ['active_popups'] });
    },
  });
}

export function useDeletePopup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('popups')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_popups'] });
      queryClient.invalidateQueries({ queryKey: ['active_popups'] });
    },
  });
}

// PostgreSQL error codes
const UNIQUE_VIOLATION = '23505';

export function useDismissPopup() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ popupId, sessionId }: { popupId: string; sessionId?: string }) => {
      const { error } = await supabase
        .from('popup_dismissals')
        .insert({
          popup_id: popupId,
          user_id: user?.id || null,
          session_id: user ? null : sessionId,
        });

      if (error && error.code !== UNIQUE_VIOLATION) throw error; // Ignore unique violation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active_popups'] });
    },
  });
}

// ============================================
// CHANGELOG
// ============================================

export interface Changelog {
  id: string;
  version: string;
  release_date: string;
  title: string | null;
  changes: string[];
  is_published: boolean;
  is_latest: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function useChangelog() {
  return useQuery({
    queryKey: ['changelog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('changelog')
        .select('*')
        .eq('is_published', true)
        .order('release_date', { ascending: false });

      if (error) throw error;
      return data as Changelog[];
    },
  });
}

export function useAdminChangelog() {
  return useQuery({
    queryKey: ['admin_changelog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('changelog')
        .select('*')
        .order('release_date', { ascending: false });

      if (error) throw error;
      return data as Changelog[];
    },
  });
}

export function useCreateChangelog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (changelog: {
      version: string;
      release_date?: string;
      title?: string;
      changes: string[];
      is_published?: boolean;
      is_latest?: boolean;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const { data, error } = await supabase
        .from('changelog')
        .insert({
          ...changelog,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog'] });
      queryClient.invalidateQueries({ queryKey: ['admin_changelog'] });
    },
  });
}

export function useUpdateChangelog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Changelog> }) => {
      const { error } = await supabase
        .from('changelog')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog'] });
      queryClient.invalidateQueries({ queryKey: ['admin_changelog'] });
    },
  });
}

export function useDeleteChangelog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('changelog')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog'] });
      queryClient.invalidateQueries({ queryKey: ['admin_changelog'] });
    },
  });
}
