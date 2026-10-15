import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useParams, useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { TierListEditor } from '@/components/tierlist/TierListEditor';
import { useTierListAccess } from '@/hooks/user/useTierListCollaboration';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

// Fetch tier list by ID (not share code)
function useTierListById(id: string) {
  useUiTranslation();
    const { user } = useAuth();

    return useQuery({
        queryKey: ['tierlist_by_id', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tier_lists')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        },
        enabled: !!id && !!user,
    });
}

export default function TierListEditPage() {
  useUiTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isDesktopApp = useIsDesktopApp();
    const { user } = useAuth();
    const { data: tierList, isLoading, error } = useTierListById(id || '');
    const { data: tierListAccess, isLoading: loadingAccess } = useTierListAccess(tierList?.id);

    const handleClose = () => {
        if (tierList?.share_code) {
            navigate(`/tierlist/${tierList.share_code}`);
        } else {
            navigate('/tierlists');
        }
    };

    // Check if current user is the owner
    const isOwner = user?.id === tierList?.user_id;
    const canEdit = isOwner || !!tierListAccess?.canEdit;

    if (isLoading || (tierList && loadingAccess)) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !tierList) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <p className="text-muted-foreground mb-4">{uiI18n.t('app.tier_list_not_found_e2e9c995')}</p>
                    <button
                        onClick={() => navigate('/tierlists')}
                        className="text-primary hover:underline"
                    >
                        {uiI18n.t('app.back_to_tier_lists_dc1afa2a')}
                    </button>
                </div>
            </div>
        );
    }

    if (!canEdit) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <p className="text-muted-foreground mb-4">{uiI18n.t('app.you_don_t_have_permission_to_edit_this_tier_list_8b788648')}</p>
                    <button
                        onClick={() => navigate('/tierlists')}
                        className="text-primary hover:underline"
                    >
                        {uiI18n.t('app.back_to_tier_lists_dc1afa2a')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
            <Background />
            <Sidebar />

            <main className={`relative z-10 ${isDesktopApp ? 'pl-6' : 'pl-6 md:pl-32'} pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6`}>
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={handleClose}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>{uiI18n.t('app.back_b52b36b7')}</span>
                    </button>
                </div>

                <div className="mb-8">
                    <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
                        {uiI18n.t('app.edit_tier_list_ad3c7aec')}
                    </h1>
                    <p className="text-muted-foreground">{uiI18n.t('app.update_your_anime_ranking_53f6f091')}</p>
                </div>

                <TierListEditor
                    initialData={{
                        id: tierList.id,
                        name: tierList.title || tierList.name,
                        description: tierList.description,
                        items: tierList.items || [],
                        is_public: tierList.is_public,
                        share_code: tierList.share_code,
                    }}
                    onClose={handleClose}
                />
            </main>

            <MobileNav />
        </div>
    );
}
