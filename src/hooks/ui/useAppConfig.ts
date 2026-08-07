import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type AppConfigKey = 'min_supported_version' | 'latest_version' | 'force_update_message' | 'android_download_url';

export interface AppConfigItem {
    key: string;
    value: string;
}

export function useAppConfig() {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['app_config'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('app_config')
                .select('*');

            if (error) {
                console.error('Error fetching app_config:', error);
                // Return empty if table doesn't exist or error
                return [];
            }
            return data as AppConfigItem[];
        },
    });

    const updateConfig = useMutation({
        mutationFn: async ({ key, value }: { key: AppConfigKey; value: string }) => {
            const { error } = await supabase
                .from('app_config')
                .upsert({ key, value });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['app_config'] });
            toast.success('Configuration updated');
        },
        onError: (error) => {
            console.error('Error updating config:', error);
            toast.error('Failed to update configuration');
        },
    });

    const getConfigValue = (key: AppConfigKey, defaultValue: string = ''): string => {
        if (!query.data) return defaultValue;
        const item = query.data.find(i => i.key === key);
        return item ? item.value : defaultValue;
    };

    return {
        ...query,
        updateConfig,
        getConfigValue,
    };
}
