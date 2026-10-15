import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type TierCollaboratorRole = 'viewer' | 'editor' | 'owner';

export interface TierListCollaborator {
  id: string;
  tier_list_id: string;
  user_id: string;
  role: TierCollaboratorRole;
  added_by: string;
  added_at: string;
  profile?: {
    user_id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

export function useTierListCollaborators(tierListId: string | undefined) {
  useUiTranslation();
  return useQuery({
    queryKey: ['tier_list_collaborators', tierListId],
    queryFn: async () => {
      if (!tierListId) return [] as TierListCollaborator[];

      const db = supabase as any;
      const { data: collaborators, error } = await db
        .from('tier_list_collaborators')
        .select('*')
        .eq('tier_list_id', tierListId)
        .order('added_at', { ascending: true });

      if (error) throw error;
      if (!collaborators || collaborators.length === 0) return [] as TierListCollaborator[];

      const userIds = [...new Set(collaborators.map((collab: any) => collab.user_id))] as string[];
      const profileMap = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, username, avatar_url')
          .in('user_id', userIds);

        (profiles || []).forEach((profile: any) => {
          profileMap.set(profile.user_id, profile);
        });
      }

      return collaborators.map((collab: any) => ({
        ...collab,
        profile: profileMap.get(collab.user_id) || null,
      })) as TierListCollaborator[];
    },
    enabled: !!tierListId,
  });
}

export function useTierListAccess(tierListId: string | undefined) {
  useUiTranslation();
  const { user } = useAuth();

  return useQuery({
    queryKey: ['tier_list_access', tierListId, user?.id],
    queryFn: async () => {
      if (!tierListId || !user) {
        return {
          isOwner: false,
          role: null as TierCollaboratorRole | null,
          canEdit: false,
          canManage: false,
        };
      }

      const { data: tierList, error: tierListError } = await supabase
        .from('tier_lists')
        .select('user_id')
        .eq('id', tierListId)
        .single();

      if (tierListError) throw tierListError;

      if (tierList.user_id === user.id) {
        return {
          isOwner: true,
          role: 'owner' as TierCollaboratorRole,
          canEdit: true,
          canManage: true,
        };
      }

      const db = supabase as any;
      const { data: collaborator } = await db
        .from('tier_list_collaborators')
        .select('role')
        .eq('tier_list_id', tierListId)
        .eq('user_id', user.id)
        .maybeSingle();

      const role = (collaborator?.role || null) as TierCollaboratorRole | null;

      return {
        isOwner: false,
        role,
        canEdit: role === 'editor' || role === 'owner',
        canManage: role === 'owner',
      };
    },
    enabled: !!tierListId && !!user,
  });
}

export function useAddTierListCollaborator() {
  useUiTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      tierListId,
      userId,
      role,
    }: {
      tierListId: string;
      userId: string;
      role: TierCollaboratorRole;
    }) => {
      if (!user) throw new Error(uiI18n.t('app.must_be_logged_in_9cf435d8'));

      const db = supabase as any;
      const { error } = await db
        .from('tier_list_collaborators')
        .insert({
          tier_list_id: tierListId,
          user_id: userId,
          role,
          added_by: user.id,
        });

      if (error) throw error;
    },
    onSuccess: (_, { tierListId }) => {
      queryClient.invalidateQueries({ queryKey: ['tier_list_collaborators', tierListId] });
      queryClient.invalidateQueries({ queryKey: ['tier_list_access', tierListId] });
      toast.success(uiI18n.t('app.collaborator_added_30f9f0b4'));
    },
    onError: (error: any) => {
      toast.error(error?.message || uiI18n.t('app.failed_to_add_collaborator_64022a3c'));
    },
  });
}

export function useUpdateTierListCollaboratorRole() {
  useUiTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tierListId,
      collaboratorId,
      role,
    }: {
      tierListId: string;
      collaboratorId: string;
      role: TierCollaboratorRole;
    }) => {
      const db = supabase as any;
      const { error } = await db
        .from('tier_list_collaborators')
        .update({ role })
        .eq('id', collaboratorId)
        .eq('tier_list_id', tierListId);

      if (error) throw error;
    },
    onSuccess: (_, { tierListId }) => {
      queryClient.invalidateQueries({ queryKey: ['tier_list_collaborators', tierListId] });
      queryClient.invalidateQueries({ queryKey: ['tier_list_access', tierListId] });
      toast.success(uiI18n.t('app.collaborator_role_updated_41cde5f8'));
    },
    onError: (error: any) => {
      toast.error(error?.message || uiI18n.t('app.failed_to_update_role_2bce86b4'));
    },
  });
}

export function useRemoveTierListCollaborator() {
  useUiTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tierListId,
      collaboratorId,
    }: {
      tierListId: string;
      collaboratorId: string;
    }) => {
      const db = supabase as any;
      const { error } = await db
        .from('tier_list_collaborators')
        .delete()
        .eq('id', collaboratorId)
        .eq('tier_list_id', tierListId);

      if (error) throw error;
    },
    onSuccess: (_, { tierListId }) => {
      queryClient.invalidateQueries({ queryKey: ['tier_list_collaborators', tierListId] });
      queryClient.invalidateQueries({ queryKey: ['tier_list_access', tierListId] });
      toast.success(uiI18n.t('app.collaborator_removed_04258d86'));
    },
    onError: (error: any) => {
      toast.error(error?.message || uiI18n.t('app.failed_to_remove_collaborator_d0efcc86'));
    },
  });
}
