import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { ExtensionManifest } from "@/pages/base/ExtensionHubPage";

// The canonical table for extensions is `extension_manifests` (written by TatakaiAPI).
// Approved extensions have submission_status = 'approved' and is_killed = false.
// We map the snake_case DB columns to the ExtensionManifest shape the UI expects.
//
// `extension_manifests` is a narrower table than the UI type: it carries no
// author, icon, banner, screenshots, categories or rating, and counts installs
// rather than downloads. Those fields were previously read off the row under
// names no column has (`author_name`, `icon_url`, `downloads`, …), so they were
// silently undefined for every manifest-backed extension — the install count in
// particular always displayed as 0. What the table does have is mapped; the rest
// is left absent rather than read from a column that isn't there. The legacy
// `extensions` table below is where those fields live, and it gets its own
// mapper.

export function mapManifestRow(row: Tables<'extension_manifests'>): ExtensionManifest {
  return {
    id: row.extension_id ?? row.id,
    name: row.name,
    description: row.description ?? '',
    version: row.version,
    author: 'Unknown',
    permissions: row.permissions ?? [],
    categories: [],
    isApproved: row.submission_status === 'approved',
    downloads: row.install_count ?? 0,
    updatedAt: row.updated_at ?? undefined,
    type: row.type as ExtensionManifest['type'],
    status: row.submission_status as ExtensionManifest['status'],
    user_id: row.submitted_by ?? undefined,
  };
}

/** The pre-manifest table, still read as a fallback. Its columns line up with
 *  the UI type almost one-to-one — including the ones extension_manifests
 *  lacks — except `isapproved`, which is all-lowercase in the database. */
export function mapLegacyExtensionRow(row: Tables<'extensions'>): ExtensionManifest {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    version: row.version,
    author: row.author ?? 'Unknown',
    icon: row.icon ?? undefined,
    banner: row.banner ?? undefined,
    screenshots: row.screenshots ?? [],
    categories: row.categories ?? [],
    permissions: row.permissions ?? [],
    isApproved: row.isapproved ?? row.status === 'approved',
    downloads: row.downloads ?? 0,
    rating: row.rating ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    type: row.type as ExtensionManifest['type'],
    status: row.status as ExtensionManifest['status'],
    user_id: row.user_id ?? undefined,
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
        .from('extension_manifests')
        .select('*')
        .eq('submission_status', 'approved')
        .eq('is_killed', false)
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback to legacy `extensions` table if extension_manifests doesn't exist
        if (error.code === '42P01') {
          const { data: legacyData, error: legacyError } = await supabase
            .from('extensions')
            .select('*')
            .eq('status', 'approved')
            .order('downloads', { ascending: false });
          if (!legacyError) {
            fetched = (legacyData ?? []).map(mapLegacyExtensionRow);
          }
        } else {
          console.error('Error fetching extensions:', error);
        }
      } else {
        fetched = (data ?? []).map(mapManifestRow);
      }

      // Build combined map: fetched < sideloaded (highest priority). There is no
      // hardcoded "official" seed layer — it shadowed the real manifest row for
      // the same extension id with a frozen copy.
      const combinedMap = new Map<string, ExtensionManifest>();
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

      // `submitted_by` is the only owner column extension_manifests has; the
      // retry on 42703 against a `user_id` column was retrying with a name the
      // table has never carried, so it could only ever fail a second time.
      const { data, error } = await supabase
        .from('extension_manifests')
        .select('*')
        .eq('submitted_by', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.code === '42703') {
          const { data: legacyData, error: legacyError } = await supabase
            .from('extensions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (!legacyError) {
            return (legacyData ?? []).map(mapLegacyExtensionRow);
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
        .from('extension_manifests')
        .insert({
          extension_id: extension.id ?? crypto.randomUUID(),
          name: extension.name ?? 'Untitled extension',
          version: extension.version ?? '1.0.0',
          type: extension.type ?? 'custom',
          description: extension.description,
          permissions: extension.permissions ?? [],
          main_url: extension.mainUrl ?? '',
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
