import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { ThemePreferences } from '@/lib/profileThemes';

export function useSaveProfileThemes() {
  const { user, refreshProfile } = useAuth();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (preferences: ThemePreferences) => {
      if (!user) throw new Error('Sign in to customize your profile.');
      const { error } = await supabase.rpc('save_profile_themes' as never, { p_preferences: preferences } as never);
      if (error) {
        if (preferences.selected === 'gothic-empress' && /Invalid profile theme preferences|Unknown profile theme/i.test(error.message)) throw new Error('Gothic Empress needs the latest profile theme database update. Apply migration 20261025000003_gothic_empress_profile_theme.sql and try again.');
        if (preferences.selected === 'uchiha' && /Invalid profile theme preferences|Unknown profile theme/i.test(error.message)) throw new Error('Uchiha is not available on this server yet. Update the server and try again.');
        if (/Invalid wallpaper URL or crop|Unknown profile|Invalid profile widget/i.test(error.message)) throw new Error('The server needs the latest SekaiPop database update for built-in wallpapers and widgets. Your draft is still saved in this editor; apply migration 20261025000001_sekai_experience.sql and retry.');
        if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Profile themes need the database update. Your draft is still here; try saving after the update is applied.');
        throw new Error(error.message || 'Could not save your profile. Please try again.');
      }
    },
    onSuccess: async () => {
      await refreshProfile();
      await Promise.all(['profile', 'public_profile', 'profile_widget'].map(key => cache.invalidateQueries({ queryKey: [key] })));
    },
  });
}
