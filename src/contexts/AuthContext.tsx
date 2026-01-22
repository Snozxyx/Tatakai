import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getLocalContinueWatching, clearLocalContinueWatching } from '@/lib/localStorage';

interface Profile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  bio: string | null;
  is_banned?: boolean;
  ban_reason?: string | null;
  is_admin?: boolean;
  is_public?: boolean;
  mal_access_token?: string | null;
  mal_refresh_token?: string | null;
  mal_username?: string | null;
  anilist_access_token?: string | null;
  anilist_username?: string | null;
  showcase_anime?: any | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  isModerator: boolean;
  isBanned: boolean;
  banReason: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const fetchProfile = async (userId: string) => {
    // Use maybeSingle() to avoid 406 when a profile doesn't exist yet
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (profileError && profileError.code !== 'PGRST116') {
      console.warn('Error fetching profile:', profileError.message || profileError);
    }

    if (profileData) {
      setProfile(profileData);
      // Set admin status from profile
      const adminStatus = profileData.is_admin || false;
      setIsAdmin(adminStatus);
      // Check if user is banned
      if (profileData.is_banned) {
        setIsBanned(true);
        setBanReason(profileData.ban_reason || null);
      } else {
        setIsBanned(false);
        setBanReason(null);
      }
    } else {
      setProfile(null);
      setIsAdmin(false);
      setIsBanned(false);
      setBanReason(null);
    }

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (rolesData) {
      const hasModRole = rolesData.some(r => r.role === 'moderator');
      setIsModerator(prev => prev || hasModRole);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            // Migrate local continue-watching entries to the database
            (async () => {
              try {
                const local = getLocalContinueWatching();
                if (local.length === 0) return;

                const records = local.map(item => ({
                  user_id: session.user!.id,
                  anime_id: item.animeId,
                  anime_name: item.animeName,
                  anime_poster: item.animePoster,
                  episode_id: item.episodeId,
                  episode_number: item.episodeNumber,
                  progress_seconds: item.progressSeconds,
                  duration_seconds: item.durationSeconds || null,
                  completed: false,
                  watched_at: item.watchedAt,
                }));

                const { error } = await supabase.from('watch_history').upsert(records, { onConflict: 'user_id,episode_id' });
                if (!error) {
                  clearLocalContinueWatching();
                  // Refresh continue watching queries
                  queryClient.invalidateQueries({ queryKey: ['continue_watching'] });
                } else {
                  console.warn('Failed to migrate local continue watching:', error.message || error);
                }
              } catch (e) {
                console.warn('Error migrating local continue watching:', e);
              }
            })();
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
          setIsModerator(false);
        }
        
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName || email.split('@')[0],
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      isAdmin,
      isModerator,
      isBanned,
      banReason,
      isLoading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
