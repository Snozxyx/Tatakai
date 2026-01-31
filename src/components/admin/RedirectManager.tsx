import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, ExternalLink, Link as LinkIcon, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

interface Redirect {
    id: string;
    slug: string;
    target_url: string;
    is_active: boolean;
    created_at: string;
}

export function RedirectManager() {
    const queryClient = useQueryClient();
    const [isAdding, setIsAdding] = useState(false);
    const [newRedirect, setNewRedirect] = useState({ slug: '', target_url: '' });

    const { data: redirects, isLoading } = useQuery({
        queryKey: ['admin_redirects'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('redirects')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data as Redirect[];
        }
    });

    const createRedirect = useMutation({
        mutationFn: async (redirect: { slug: string; target_url: string }) => {
            const { error } = await supabase
                .from('redirects')
                .insert([redirect]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_redirects'] });
            toast.success('Redirect created');
            setIsAdding(false);
            setNewRedirect({ slug: '', target_url: '' });
        },
        onError: (error: any) => {
            toast.error('Failed to create redirect: ' + error.message);
        }
    });

    const deleteRedirect = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('redirects')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_redirects'] });
            toast.success('Redirect deleted');
        }
    });

    const toggleStatus = useMutation({
        mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
            const { error } = await supabase
                .from('redirects')
                .update({ is_active })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_redirects'] });
        }
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <LinkIcon className="w-6 h-6 text-primary" />
                        URL Redirects
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage custom short links and redirects
                    </p>
                </div>
                {!isAdding && (
                    <Button onClick={() => setIsAdding(true)} className="gap-2">
                        <Plus className="w-4 h-4" /> Add Redirect
                    </Button>
                )}
            </div>

            {isAdding && (
                <GlassPanel className="p-4 border-primary/20 bg-primary/5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Slug (e.g. discord)</label>
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground font-medium">/</span>
                                <Input
                                    placeholder="slug"
                                    value={newRedirect.slug}
                                    onChange={(e) => setNewRedirect({ ...newRedirect, slug: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Target URL</label>
                            <Input
                                placeholder="https://example.com"
                                value={newRedirect.target_url}
                                onChange={(e) => setNewRedirect({ ...newRedirect, target_url: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                        <Button
                            onClick={() => createRedirect.mutate(newRedirect)}
                            disabled={createRedirect.isPending || !newRedirect.slug || !newRedirect.target_url}
                            className="gap-2"
                        >
                            <Save className="w-4 h-4" /> Create Redirect
                        </Button>
                    </div>
                </GlassPanel>
            )}

            <div className="grid gap-3">
                {isLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                ) : redirects?.length === 0 ? (
                    <p className="text-center py-10 text-muted-foreground">No redirects configured</p>
                ) : (
                    redirects?.map((r) => (
                        <GlassPanel key={r.id} className="p-4 hover:bg-white/5 transition-colors">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className={`p-2 rounded-xl ${r.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                        <LinkIcon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold">/{r.slug}</span>
                                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate max-w-md">{r.target_url}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 p-0 rounded-lg hover:text-primary"
                                        onClick={() => window.open(r.target_url, '_blank')}
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`h-9 w-9 p-0 rounded-lg ${r.is_active ? 'text-green-500' : 'text-muted-foreground'}`}
                                        onClick={() => toggleStatus.mutate({ id: r.id, is_active: !r.is_active })}
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 p-0 rounded-lg hover:text-destructive text-muted-foreground"
                                        onClick={() => {
                                            if (confirm('Delete this redirect?')) deleteRedirect.mutate(r.id);
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </GlassPanel>
                    ))
                )}
            </div>
        </div>
    );
}

function ArrowRight({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
        </svg>
    );
}

function CheckCircle({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    );
}
