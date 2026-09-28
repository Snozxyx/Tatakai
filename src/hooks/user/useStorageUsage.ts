import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { listUserMedia } from '@/lib/userMedia';

/** Default per-user media quota until the storage-quota migration lands. */
export const DEFAULT_STORAGE_QUOTA_BYTES = 25 * 1024 * 1024; // 25 MB

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
  /** True when the figures came from the profiles columns (source of truth). */
  fromProfile: boolean;
}

/**
 * A user's media storage usage. Source of truth is
 * `profiles.storage_used_bytes` / `storage_quota_bytes` (from the unapplied
 * `20260925000100_storage_quota` migration); until those columns exist, falls
 * back to summing the user's uploaded media against a 25 MB default quota. The
 * column select is defensive — a missing-column error just drops to the sum.
 */
export function useStorageUsage() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['storage-usage', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<StorageUsage> => {
      const uid = user!.id;

      let usedBytes: number | null = null;
      let quotaBytes: number | null = null;
      const { data, error } = await supabase
        .from('profiles')
        .select('storage_used_bytes, storage_quota_bytes')
        .eq('user_id', uid)
        .maybeSingle();
      if (!error && data) {
        usedBytes = (data as any).storage_used_bytes ?? null;
        quotaBytes = (data as any).storage_quota_bytes ?? null;
      }

      if (usedBytes != null && quotaBytes != null) {
        return { usedBytes, quotaBytes, fromProfile: true };
      }

      // Fallback: sum the sizes of everything the user has uploaded.
      const files = await listUserMedia(uid);
      const summed = files.reduce((n, f) => n + (f.size || 0), 0);
      return {
        usedBytes: usedBytes ?? summed,
        quotaBytes: quotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES,
        fromProfile: false,
      };
    },
  });
}
