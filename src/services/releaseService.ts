import { supabase } from "@/integrations/supabase/client";

export interface AppRelease {
    id: string;
    version: string;
    platform: 'win' | 'mac' | 'linux' | 'android';
    url: string;
    notes: string | null;
    metadata: any;
    is_latest: boolean;
    created_at: string;
    updated_at: string;
}

export class ReleaseService {
    /**
     * Fetch a single latest release for a specific platform
     */
    static async getLatestRelease(platform: 'win' | 'mac' | 'linux' | 'android'): Promise<AppRelease | null> {
        try {
            const { data, error } = await supabase
                .from('app_releases')
                .select('*')
                .eq('platform', platform)
                .eq('is_latest', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error(`Failed to fetch latest ${platform} release:`, error);
            return null;
        }
    }

    /**
     * Fetch all releases for a specific platform
     */
    static async getAllReleases(platform?: 'win' | 'mac' | 'linux' | 'android'): Promise<AppRelease[]> {
        try {
            let query = supabase
                .from('app_releases')
                .select('*')
                .order('created_at', { ascending: false });

            if (platform) {
                query = query.eq('platform', platform);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Failed to fetch all releases:', error);
            return [];
        }
    }

    /**
     * Fetch the latest version string across all platforms or for a specific one
     */
    static async getLatestVersion(platform?: 'win' | 'mac' | 'linux' | 'android'): Promise<string | null> {
        try {
            let query = supabase
                .from('app_releases')
                .select('version')
                .eq('is_latest', true)
                .order('created_at', { ascending: false })
                .limit(1);

            if (platform) {
                query = query.eq('platform', platform);
            }

            const { data, error } = await query.maybeSingle();
            if (error) throw error;
            return data?.version || null;
        } catch (error) {
            console.error('Failed to fetch latest version:', error);
            return null;
        }
    }
}
