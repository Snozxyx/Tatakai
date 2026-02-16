import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
    Download, Plus, Trash2, Edit2, CheckCircle,
    XCircle, Monitor, Apple, Terminal, Save, X
} from 'lucide-react';

interface AppRelease {
    id: string;
    version: string;
    platform: 'win' | 'mac' | 'linux' | 'android';
    url: string;
    notes: string | null;
    metadata: any;
    is_latest: boolean;
    created_at: string;
}

export function AppReleaseManager() {
    const queryClient = useQueryClient();
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [version, setVersion] = useState('');
    const [platform, setPlatform] = useState<'win' | 'mac' | 'linux' | 'android'>('win');
    const [url, setUrl] = useState('');
    const [notes, setNotes] = useState('');
    const [isLatest, setIsLatest] = useState(true);

    // Fetch releases
    const { data: releases, isLoading } = useQuery({
        queryKey: ['admin_app_releases'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('app_releases')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data as AppRelease[];
        },
    });

    // Create/Update mutation
    const saveMutation = useMutation({
        mutationFn: async (payload: any) => {
            const { id, ...data } = payload;

            // If setting as latest, unset other latests for this platform
            if (data.is_latest) {
                await supabase
                    .from('app_releases')
                    .update({ is_latest: false })
                    .eq('platform', data.platform);
            }

            if (id) {
                const { error } = await supabase
                    .from('app_releases')
                    .update(data)
                    .eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('app_releases')
                    .insert(data);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_app_releases'] });
            toast.success(editingId ? 'Release updated' : 'Release added');
            resetForm();
        },
        onError: (error) => {
            console.error('Save release error:', error);
            toast.error('Failed to save release');
        }
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('app_releases')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_app_releases'] });
            toast.success('Release deleted');
        },
        onError: (error) => {
            console.error('Delete release error:', error);
            toast.error('Failed to delete release');
        }
    });

    const resetForm = () => {
        setVersion('');
        setPlatform('win');
        setUrl('');
        setNotes('');
        setIsLatest(true);
        setIsAdding(false);
        setEditingId(null);
    };

    const handleEdit = (release: AppRelease) => {
        setVersion(release.version);
        setPlatform(release.platform);
        setUrl(release.url);
        setNotes(release.notes || '');
        setIsLatest(release.is_latest);
        setEditingId(release.id);
        setIsAdding(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!version || !url) {
            toast.error('Version and URL are required');
            return;
        }
        saveMutation.mutate({
            id: editingId,
            version,
            platform,
            url,
            notes,
            is_latest: isLatest,
            updated_at: new Date().toISOString()
        });
    };

    const getPlatformIcon = (p: string) => {
        switch (p) {
            case 'win': return <Monitor className="w-4 h-4" />;
            case 'mac': return <Apple className="w-4 h-4 fill-current" />;
            case 'linux': return <Terminal className="w-4 h-4" />;
            default: return <Download className="w-4 h-4" />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-primary" />
                    <h3 className="font-display text-lg font-semibold">App Downloads Management</h3>
                </div>
                {!isAdding && (
                    <Button onClick={() => setIsAdding(true)} size="sm" className="gap-2">
                        <Plus className="w-4 h-4" /> Add Release
                    </Button>
                )}
            </div>

            {isAdding && (
                <GlassPanel className="p-6 border-primary/20 bg-primary/5">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium text-sm text-primary">
                                {editingId ? 'Edit Release' : 'New Release'}
                            </h4>
                            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="version">Version</Label>
                                <Input
                                    id="version"
                                    value={version}
                                    onChange={(e) => setVersion(e.target.value)}
                                    placeholder="e.g. 1.2.0"
                                    className="bg-background/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="platform">Platform</Label>
                                <select
                                    id="platform"
                                    value={platform}
                                    onChange={(e) => setPlatform(e.target.value as any)}
                                    className="w-full bg-background/50 border border-input rounded-md px-3 py-2 text-sm"
                                >
                                    <option value="win">Windows</option>
                                    <option value="mac">macOS</option>
                                    <option value="linux">Linux</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="url">Download URL</Label>
                            <Input
                                id="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://github.com/.../release.exe"
                                className="bg-background/50"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">Release Notes</Label>
                            <Textarea
                                id="notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="What's new in this version?"
                                className="bg-background/50 min-h-[80px]"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isLatest"
                                checked={isLatest}
                                onChange={(e) => setIsLatest(e.target.checked)}
                                className="rounded border-gray-400 text-primary focus:ring-primary"
                            />
                            <Label htmlFor="isLatest" className="cursor-pointer">Set as Latest</Label>
                        </div>

                        <Button type="submit" disabled={saveMutation.isPending} className="w-full gap-2">
                            <Save className="w-4 h-4" />
                            {saveMutation.isPending ? 'Saving...' : 'Save Release'}
                        </Button>
                    </form>
                </GlassPanel>
            )}

            {isLoading ? (
                <div className="text-center py-8 text-muted-foreground italic">Loading releases...</div>
            ) : releases && releases.length > 0 ? (
                <div className="grid gap-3">
                    {releases.map((release) => (
                        <div
                            key={release.id}
                            className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${release.is_latest ? 'bg-primary/5 border-primary/20' : 'bg-muted/10 border-white/5'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-lg ${release.is_latest ? 'bg-primary/20 text-primary' : 'bg-muted/20 text-muted-foreground'}`}>
                                    {getPlatformIcon(release.platform)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm">v{release.version}</span>
                                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                                            {release.platform}
                                        </span>
                                        {release.is_latest && (
                                            <span className="text-[10px] uppercase font-bold text-emerald-500 flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" /> Latest
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground truncate max-w-[200px] md:max-w-md">
                                        {release.url}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(release)}
                                    className="h-8 w-8 p-0"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        if (confirm('Delete this release?')) deleteMutation.mutate(release.id);
                                    }}
                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 rounded-xl border border-dashed border-white/10 text-muted-foreground">
                    <XCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p>No releases found in the database.</p>
                </div>
            )}
        </div>
    );
}
