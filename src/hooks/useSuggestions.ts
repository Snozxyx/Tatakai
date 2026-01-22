import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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

// Fetch all suggestions (admin only)
export function useAllSuggestions() {
  const { isAdmin } = useAuth();

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
    enabled: isAdmin,
  });
}

// Create suggestion
export function useCreateSuggestion() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (suggestion: {
      title: string;
      description: string;
      category: Suggestion['category'];
      image_url?: string;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const { data, error } = await supabase
        .from('user_suggestions')
        .insert({
          user_id: user.id,
          ...suggestion,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_suggestions'] });
      toast.success('Suggestion submitted successfully!');
    },
    onError: () => {
      toast.error('Failed to submit suggestion');
    },
  });
}

// Update suggestion (user can only update pending, admin can update any)
export function useUpdateSuggestion() {
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
      toast.success('Suggestion updated');
    },
    onError: () => {
      toast.error('Failed to update suggestion');
    },
  });
}

// Delete suggestion
export function useDeleteSuggestion() {
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
      toast.success('Suggestion deleted');
    },
    onError: () => {
      toast.error('Failed to delete suggestion');
    },
  });
}

// Admin: Update suggestion status
export function useReviewSuggestion() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

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
      if (!isAdmin) throw new Error('Admin access required');

      const { error } = await supabase
        .from('user_suggestions')
        .update({
          status,
          priority: priority || undefined,
          admin_notes: adminNotes || undefined,
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      // Log admin action
      await supabase.from('admin_logs').insert({
        user_id: user!.id,
        action: `review_suggestion_${status}`,
        entity_type: 'user_suggestion',
        entity_id: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all_suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
      toast.success('Suggestion reviewed');
    },
    onError: () => {
      toast.error('Failed to review suggestion');
    },
  });
}
