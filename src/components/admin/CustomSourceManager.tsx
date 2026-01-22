import { useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Edit2, Check, X, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CustomSource {
    id: string;
    name: string;
    url: string;
    type: 'embed' | 'direct';
    is_active: boolean;
    anime_id?: string;
    episode_id?: string;
    created_at?: string;
}

export function CustomSourceManager() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingSource, setEditingSource] = useState<CustomSource | null>(null);
    const queryClient = useQueryClient();

    // New Source Form State
    const [formData, setFormData] = useState<Partial<CustomSource>>({
        name: '',
        url: '',
        type: 'embed',
        is_active: true,
        anime_id: '',
        episode_id: ''
    });

    // Fetch Sources
    const { data: sources, isLoading } = useQuery({
        queryKey: ['custom-sources'],
        queryFn: async () => {
            const { data, error: fetchError } = await supabase
                .from('custom_sources')
                .select('*')
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;
            return data as CustomSource[];
        }
    });

    const createMutation = useMutation({
        mutationFn: async (newSource: Partial<CustomSource>) => {
            const { data, error } = await supabase
                .from('custom_sources')
                .upsert(newSource)
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['custom-sources'] });
            setIsDialogOpen(false);
            resetForm();
            toast.success(editingSource ? 'Source updated' : 'Source added');
        },
        onError: (err) => toast.error('Failed to save source: ' + err.message)
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('custom_sources').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['custom-sources'] });
            toast.success('Source deleted');
        }
    });

    const resetForm = () => {
        setFormData({
            name: '',
            url: '',
            type: 'embed',
            is_active: true,
            anime_id: '',
            episode_id: ''
        });
        setEditingSource(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.url || !formData.anime_id || !formData.episode_id) {
            toast.error('Name, URL, Anime ID, and Episode ID are all required');
            return;
        }

        const submitData = { ...formData };

        createMutation.mutate(submitData);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-primary" />
                    Custom Sources Management
                </h2>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={resetForm} className="gap-2">
                            <Plus className="w-4 h-4" /> Add Source
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-background/95 backdrop-blur-xl border-white/10">
                        <DialogHeader>
                            <DialogTitle>{editingSource ? 'Edit Source' : 'Add New Source'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Source Name</label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. MegaCloud Backup"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Stream URL</label>
                                <Input
                                    value={formData.url}
                                    onChange={e => setFormData({ ...formData, url: e.target.value })}
                                    placeholder="https://..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Type</label>
                                    <Select
                                        value={formData.type}
                                        onValueChange={(v: any) => setFormData({ ...formData, type: v })}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="embed">Embed (Iframe)</SelectItem>
                                            <SelectItem value="direct">Direct (MP4/HLS)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Status</label>
                                    <div className="flex items-center gap-2 h-10">
                                        <Button
                                            type="button"
                                            variant={formData.is_active ? 'default' : 'outline'}
                                            onClick={() => setFormData({ ...formData, is_active: true })}
                                            className="flex-1"
                                        >
                                            Active
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={!formData.is_active ? 'destructive' : 'outline'}
                                            onClick={() => setFormData({ ...formData, is_active: false })}
                                            className="flex-1"
                                        >
                                            Inactive
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Target Anime ID <span className="text-destructive">*</span></label>
                                    <Input
                                        value={formData.anime_id}
                                        onChange={e => setFormData({ ...formData, anime_id: e.target.value })}
                                        placeholder="e.g. one-piece-37"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Target Episode ID <span className="text-destructive">*</span></label>
                                    <Input
                                        value={formData.episode_id}
                                        onChange={e => setFormData({ ...formData, episode_id: e.target.value })}
                                        placeholder="e.g. one-piece-37?ep=123"
                                        required
                                    />
                                </div>
                            </div>
                            <Button type="submit" className="w-full mt-4" disabled={createMutation.isPending}>
                                {createMutation.isPending ? 'Saving...' : 'Save Source'}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-4">
                {isLoading ? (
                    <div className="text-center py-10 opacity-50">Loading sources...</div>
                ) : sources?.length === 0 ? (
                    <GlassPanel className="p-8 text-center text-muted-foreground">
                        No custom sources found. Add one to get started.
                    </GlassPanel>
                ) : (
                    sources?.map((source) => (
                        <GlassPanel key={source.id} className="p-4 flex items-center justify-between group">
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-lg ${source.type === 'embed' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                    {source.type === 'embed' ? '< />' : 'MP4'}
                                </div>
                                <div>
                                    <h3 className="font-bold">{source.name}</h3>
                                    <p className="text-xs text-muted-foreground truncate max-w-[200px] md:max-w-md">{source.url}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${source.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {source.is_active ? 'Active' : 'Inactive'}
                                </span>
                                <div className="w-px h-4 bg-white/10 mx-2" />
                                <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(source.id)}>
                                    <Trash2 className="w-4 h-4 text-destructive/70 hover:text-destructive" />
                                </Button>
                            </div>
                        </GlassPanel>
                    ))
                )}
            </div>
        </div>
    );
}
