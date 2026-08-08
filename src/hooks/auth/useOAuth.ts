/**
 * OAuth authentication hooks
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type OAuthProvider = 'google' | 'github' | 'discord';

/**
 * Sign in with OAuth provider
 */
export function useOAuthSignIn() {
  return useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
      return data;
    },
    onError: (error: Error) => {
      toast.error(`Failed to sign in with ${error.message}`);
    },
  });
}

/**
 * Sign up with OAuth provider
 */
export function useOAuthSignUp() {
  return useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
      return data;
    },
    onError: (error: Error) => {
      toast.error(`Failed to sign up with ${error.message}`);
    },
  });
}
