import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { notifySuggestion } from '@/core/network/discord-webhook';

export interface Suggestion {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: 'feature' | 'bug' | 'improvement' | 'content' | 'other';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'implemented';
  image_url?: string;
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  };
}

// Fetch user's own suggestions
export function useUserSuggestions() {
  useUiTranslation();
  const { user } = useAuth();

  return useQuery<Suggestion[]>({
    queryKey: ['user_suggestions', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_suggestions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Suggestion[];
    },
    enabled: !!user,
  });
}

// Fetch all suggestions (admin and moderator)
export function useAllSuggestions() {
  useUiTranslation();
  const { isAdmin, isModerator } = useAuth();

  return useQuery<Suggestion[]>({
    queryKey: ['all_suggestions'],
    queryFn: async () => {
      const { data: suggestions, error } = await supabase
        .from('user_suggestions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!suggestions || suggestions.length === 0) return [];

      // Fetch user profiles
      const userIds = [...new Set(suggestions.map(s => s.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      return suggestions.map(suggestion => ({
        ...suggestion,
        profiles: profileMap.get(suggestion.user_id) || null,
      })) as Suggestion[];
    },
    enabled: isAdmin || isModerator,
  });
}

// Create suggestion
export function useCreateSuggestion() {
  useUiTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (suggestion: {
      title: string;
      description: string;
      category: Suggestion['category'];
      image_url?: string;
    }) => {
      if (!user) throw new Error(uiI18n.t('app.must_be_logged_in_9cf435d8'));

      const { data, error } = await supabase
        .from('user_suggestions')
        .insert({
          user_id: user.id,
          ...suggestion,
          status: 'pending',
          priority: 'normal',
        })
        .select()
        .single();

      if (error) throw error;

      // Best-effort Discord notification (server-side forwarded; never blocks).
      try {
        notifySuggestion({
          title: suggestion.title,
          description: suggestion.description,
          category: suggestion.category,
          priority: 'normal',
          userId: user.id,
          userName: user.user_metadata?.display_name || user.email || undefined,
          imageUrl: suggestion.image_url,
        });
      } catch { /* ignore */ }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_suggestions'] });
      toast.success(uiI18n.t('app.suggestion_submitted_successfully_fd77f3a2'));
    },
    onError: () => {
      toast.error(uiI18n.t('app.failed_to_submit_suggestion_75b3eeb9'));
    },
  });
}

// Update suggestion (user can only update pending, admin can update any)
export function useUpdateSuggestion() {
  useUiTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Suggestion> }) => {
      const { error } = await supabase
        .from('user_suggestions')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['all_suggestions'] });
      toast.success(uiI18n.t('app.suggestion_updated_dcc673f9'));
    },
    onError: () => {
      toast.error(uiI18n.t('app.failed_to_update_suggestion_32fde31b'));
    },
  });
}

// Delete suggestion
export function useDeleteSuggestion() {
  useUiTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_suggestions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['all_suggestions'] });
      toast.success(uiI18n.t('app.suggestion_deleted_03961a2a'));
    },
    onError: () => {
      toast.error(uiI18n.t('app.failed_to_delete_suggestion_1946fb23'));
    },
  });
}

// Admin/Moderator: Update suggestion status
export function useReviewSuggestion() {
  useUiTranslation();
  const queryClient = useQueryClient();
  const { user, isAdmin, isModerator } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      priority,
      adminNotes
    }: {
      id: string;
      status: Suggestion['status'];
      priority?: Suggestion['priority'];
      adminNotes?: string;
    }) => {
      if (!user || (!isAdmin && !isModerator)) throw new Error(uiI18n.t('app.admin_or_moderator_access_required_2b533dec'));

      const { error } = await supabase
        .from('user_suggestions')
        .update({
          status,
          priority: priority || undefined,
          admin_notes: adminNotes || undefined,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      // Log staff action
      await supabase.from('admin_logs').insert({
        user_id: user.id,
        action: `review_suggestion_${status}`,
        entity_type: 'user_suggestion',
        entity_id: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all_suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
      toast.success(uiI18n.t('app.suggestion_reviewed_9130f70e'));
    },
    onError: () => {
      toast.error(uiI18n.t('app.failed_to_review_suggestion_1f90ea43'));
    },
  });
}
