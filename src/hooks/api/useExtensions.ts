import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExtensionManifest } from "@/pages/base/ExtensionHubPage";
import { OFFICIAL_EXTENSIONS } from "@/core/extensions/defaultExtensions";

// The canonical table for extensions is `extension_manifests` (written by TatakaiAPI).
// Approved extensions have submission_status = 'approved' and is_killed = false.
// We map the snake_case DB columns to the ExtensionManifest shape the UI expects.

function mapManifestRow(row: any): ExtensionManifest {
  return {
    id: row.extension_id ?? row.id,
    name: row.name,
    description: row.description ?? '',
    version: row.version,
    author: row.author_name ?? row.author ?? 'Unknown',
    icon: row.icon_url ?? row.icon ?? undefined,
    banner: row.banner_url ?? row.banner ?? undefined,
    screenshots: row.screenshots ?? [],
    categories: row.categories ?? [],
    permissions: row.permissions ?? [],
    isApproved: row.submission_status === 'approved',
    downloads: row.downloads ?? 0,
    rating: row.rating ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    type: row.type,
    status: row.submission_status,
    user_id: row.submitted_by ?? row.user_id ?? undefined,
  };
}

export function useExtensions() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleSideloaded = () => {
      queryClient.invalidateQueries({ queryKey: ['extensions'] });
    };
    window.addEventListener('tatakai:extension-sideloaded', handleSideloaded);
    return () => {
      window.removeEventListener('tatakai:extension-sideloaded', handleSideloaded);
    };
  }, [queryClient]);

  // Fetch approved extensions from extension_manifests (the canonical table) + local sideloaded
  const { data: extensions, isLoading } = useQuery({
    queryKey: ['extensions', 'approved'],
    queryFn: async () => {
      const sideloadedRaw = typeof window !== 'undefined' ? localStorage.getItem('tatakai_sideloaded_extensions') : null;
      const sideloadedList: ExtensionManifest[] = sideloadedRaw ? JSON.parse(sideloadedRaw) : [];

      let fetched: ExtensionManifest[] = [];
      const { data, error } = await supabase
        .from('extension_manifests' as any)
        .select('*')
        .eq('submission_status', 'approved')
        .eq('is_killed', false)
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback to legacy `extensions` table if extension_manifests doesn't exist
        if (error.code === '42P01') {
          const { data: legacyData, error: legacyError } = await supabase
            .from('extensions' as any)
            .select('*')
            .eq('status', 'approved')
            .order('downloads', { ascending: false });
          if (!legacyError) {
            fetched = (legacyData ?? []) as ExtensionManifest[];
          }
        } else {
          console.error('Error fetching extensions:', error);
        }
      } else {
        fetched = (data ?? []).map(mapManifestRow);
      }

      // Build combined map: official < fetched < sideloaded (highest priority)
      const combinedMap = new Map<string, ExtensionManifest>();
      OFFICIAL_EXTENSIONS.forEach(item => combinedMap.set(item.id, item));
      fetched.forEach(item => combinedMap.set(item.id, item));
      sideloadedList.forEach(item => combinedMap.set(item.id, { ...item, isApproved: true }));
      return Array.from(combinedMap.values());
    },
  });

  // Fetch current user's submissions from extension_manifests
  const { data: mySubmissions } = useQuery({
    queryKey: ['extensions', 'my-submissions'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const fetchSubmissions = async (column: 'submitted_by' | 'user_id') => {
        return supabase
          .from('extension_manifests' as any)
          .select('*')
          .eq(column, user.id)
          .order('created_at', { ascending: false });
      };

      const { data, error } = await fetchSubmissions('submitted_by');

      if (error) {
        if (error.code === '42703') {
          const { data: fallbackData, error: fallbackError } = await fetchSubmissions('user_id');
          if (!fallbackError) {
            return (fallbackData ?? []).map(mapManifestRow);
          }
        }

        if (error.code === '42P01' || error.code === '42703') {
          const { data: legacyData, error: legacyError } = await supabase
            .from('extensions' as any)
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (!legacyError) {
            return (legacyData ?? []) as ExtensionManifest[];
          }
        }

        return [];
      }

      return (data ?? []).map(mapManifestRow);
    },
  });

  // Submit new extension (legacy path — direct Supabase insert)
  const submitExtension = useMutation({
    mutationFn: async (extension: Partial<ExtensionManifest>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Must be logged in to submit an extension");

      const { data, error } = await supabase
        .from('extension_manifests' as any)
        .insert({
          extension_id: extension.id ?? crypto.randomUUID(),
          name: extension.name,
          version: extension.version ?? '1.0.0',
          type: extension.type ?? 'custom',
          description: extension.description,
          permissions: extension.permissions ?? [],
          main_url: extension.mainUrl ?? extension.main_url ?? '',
          submission_status: 'pending',
          submitted_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extensions'] });
      toast.success("Extension submitted for review!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to submit extension");
    }
  });

  return {
    extensions: extensions || [],
    isLoading,
    mySubmissions: mySubmissions || [],
    submitExtension,
  };
}
