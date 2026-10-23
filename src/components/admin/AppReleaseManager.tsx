import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
    XCircle, Monitor, Apple, Terminal, Smartphone, Tv, Save, X
} from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface AppRelease {
    id: string;
    version: string;
    platform: 'win' | 'mac' | 'linux' | 'android' | 'android-tv';
    url: string;
    notes: string | null;
    metadata: any;
    is_latest: boolean;
    created_at: string;
}

export function AppReleaseManager() {
  useUiTranslation();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [version, setVersion] = useState('');
    const [platform, setPlatform] = useState<'win' | 'mac' | 'linux' | 'android' | 'android-tv'>('win');
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
            toast.success(editingId ? uiI18n.t('app.release_updated_ff22718f') : uiI18n.t('app.release_added_a9d2295c'));
            resetForm();
        },
        onError: (error) => {
            console.error('Save release error:', error);
            toast.error(uiI18n.t('app.failed_to_save_release_a633b5be'));
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
            toast.success(uiI18n.t('app.release_deleted_bd2a1e29'));
        },
        onError: (error) => {
            console.error('Delete release error:', error);
            toast.error(uiI18n.t('app.failed_to_delete_release_30f0aa4e'));
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
            toast.error(uiI18n.t('app.version_and_url_are_required_f1548538'));
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
            case 'android': return <Smartphone className="w-4 h-4" />;
            case 'android-tv': return <Tv className="w-4 h-4" />;
            default: return <Download className="w-4 h-4" />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-primary" />
                    <h3 className="font-display text-lg font-semibold">{uiI18n.t('app.app_downloads_management_1ad702c9')}</h3>
                </div>
                {!isAdding && (
                    <Button onClick={() => setIsAdding(true)} size="sm" className="gap-2">
                        <Plus className="w-4 h-4" /> {uiI18n.t('app.add_release_f572609f')}
                    </Button>
                )}
            </div>

            {isAdding && (
                <GlassPanel className="p-6 border-primary/20 bg-primary/5">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium text-sm text-primary">
                                {editingId ? uiI18n.t('app.edit_release_c0acc67e') : uiI18n.t('app.new_release_e75aa11b')}
                            </h4>
                            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="version">{uiI18n.t('app.version_2da600bf')}</Label>
                                <Input
                                    id="version"
                                    value={version}
                                    onChange={(e) => setVersion(e.target.value)}
                                    placeholder="e.g. 1.2.0"
                                    className="bg-background/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="platform">{uiI18n.t('app.platform_123a7f2f')}</Label>
                                <ThemedSelect
                                    id="platform"
                                    value={platform}
                                    onChange={(e) => setPlatform(e.target.value as any)}
                                    className="w-full bg-background/50 border border-input rounded-md px-3 py-2 text-sm"
                                >
                                    <option value="win">{uiI18n.t('app.windows_26d9c28d')}</option>
                                    <option value="mac">{uiI18n.t('app.macos_cd6fdcbf')}</option>
                                    <option value="linux">{uiI18n.t('app.linux_83ad8510')}</option>
                                    <option value="android">Android</option>
                                    <option value="android-tv">Android TV</option>
                                </ThemedSelect>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="url">{uiI18n.t('app.download_url_42aa0f68')}</Label>
                            <Input
                                id="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://github.com/.../release.exe"
                                className="bg-background/50"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">{uiI18n.t('app.release_notes_0ea4af90')}</Label>
                            <Textarea
                                id="notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder={uiI18n.t('app.what_s_new_in_this_version_a5407fa9')}
                                className="bg-background/50 min-h-[80px]"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <ThemedCheckbox
                                type="checkbox"
                                id="isLatest"
                                checked={isLatest}
                                onChange={(e) => setIsLatest(e.target.checked)}
                                className="rounded border-gray-400 text-primary focus:ring-primary"
                            />
                            <Label htmlFor="isLatest" className="cursor-pointer">{uiI18n.t('app.set_as_latest_f1e66ab3')}</Label>
                        </div>

                        <Button type="submit" disabled={saveMutation.isPending} className="w-full gap-2">
                            <Save className="w-4 h-4" />
                            {saveMutation.isPending ? 'Saving...' : uiI18n.t('app.save_release_bed0f62b')}
                        </Button>
                    </form>
                </GlassPanel>
            )}

            {isLoading ? (
                <div className="text-center py-8 text-muted-foreground italic">{uiI18n.t('app.loading_releases_23834fbc')}</div>
            ) : releases && releases.length > 0 ? (
                <div className="grid gap-3">
                    {releases.map((release) => (
                        <div
                            key={release.id}
                            className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${release.is_latest ? 'bg-primary/5 border-primary/20' : 'bg-muted/10 border-white/5'}`}
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
                                                <CheckCircle className="w-3 h-3" /> {uiI18n.t('app.latest_decd7ca8')}
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
                                    onClick={async () => {
                                        if (await confirm({ get title() { return uiI18n.t('app.delete_this_release_46d27013'); }, destructive: true })) deleteMutation.mutate(release.id);
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
                    <p>{uiI18n.t('app.no_releases_found_in_the_database_ace84e29')}</p>
                </div>
            )}
        </div>
    );
}
