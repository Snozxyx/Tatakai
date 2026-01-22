import { useParams, useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { TierListEditor } from '@/components/tierlist/TierListEditor';
import { useTierListByShareCode, useUserTierLists } from '@/hooks/useTierLists';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Fetch tier list by ID (not share code)
function useTierListById(id: string) {
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
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { data: tierList, isLoading, error } = useTierListById(id || '');

    const handleClose = () => {
        if (tierList?.share_code) {
            navigate(`/tierlist/${tierList.share_code}`);
        } else {
            navigate('/tierlists');
        }
    };

    // Check if current user is the owner
    const isOwner = user?.id === tierList?.user_id;

    if (isLoading) {
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
                    <p className="text-muted-foreground mb-4">Tier list not found</p>
                    <button
                        onClick={() => navigate('/tierlists')}
                        className="text-primary hover:underline"
                    >
                        Back to Tier Lists
                    </button>
                </div>
            </div>
        );
    }

    if (!isOwner) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <p className="text-muted-foreground mb-4">You don't have permission to edit this tier list</p>
                    <button
                        onClick={() => navigate('/tierlists')}
                        className="text-primary hover:underline"
                    >
                        Back to Tier Lists
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
            <Background />
            <Sidebar />

            <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={handleClose}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>Back</span>
                    </button>
                </div>

                <div className="mb-8">
                    <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
                        Edit Tier List
                    </h1>
                    <p className="text-muted-foreground">Update your anime ranking</p>
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
