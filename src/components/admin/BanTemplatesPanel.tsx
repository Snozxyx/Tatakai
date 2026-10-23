import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
// BanTemplatesPanel — Requirements 12.1–12.7
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, RefreshCw, XCircle, BookMarked, PlusCircle, Trash2 } from 'lucide-react';
import { sortTemplatesAlpha, validateTemplateName } from '@/utils/banUtils';
import type { BanTemplate } from '@/types/admin-dashboard';

const QUERY_KEY = ['admin_ban_templates'] as const;

export function BanTemplatesPanel() {
  useUiTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [durationHours, setDurationHours] = useState<number | null>(null);
  const [durationPreset, setDurationPreset] = useState<'permanent' | '7d' | '30d' | 'custom'>('permanent');
  const [customHours, setCustomHours] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: templates, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<BanTemplate[]> => {
      const { data, error } = await (supabase
        .from('ban_templates' as any)
        .select('*')
        .order('name') as any);
      if (error) throw error;
      return sortTemplatesAlpha((data ?? []) as BanTemplate[]);
    },
  });

  const insertMutation = useMutation({
    mutationFn: async () => {
      const { data: currentUser } = await supabase.auth.getUser();
      const hours = durationPreset === 'permanent' ? null
        : durationPreset === '7d' ? 168
        : durationPreset === '30d' ? 720
        : (parseInt(customHours, 10) || null);
      const { error } = await (supabase
        .from('ban_templates' as any)
        .insert({ name, reason, duration_hours: hours, created_by: currentUser.user?.id }) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setName(''); setReason(''); setDurationPreset('permanent'); setCustomHours('');
      setFormError(null); setShowForm(false);
      toast.success(uiI18n.t('app.template_saved_aa1dc3dd'));
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
        setFormError('A template with this name already exists');
      } else {
        toast.error(uiI18n.t('app.failed_to_save_template_i18n_value_0_6269f384', { value0: msg }));
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('ban_templates' as any).delete().eq('id', id) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setConfirmDeleteId(null);
      toast.success(uiI18n.t('app.template_deleted_c8fdb612'));
    },
    onError: () => toast.error(uiI18n.t('app.failed_to_delete_template_cd7811a5')),
  });

  const existingNames = (templates ?? []).map((t) => t.name);
  const isFormValid =
    validateTemplateName(name, existingNames) &&
    reason.trim().length > 0 &&
    (durationPreset !== 'custom' || (parseInt(customHours, 10) >= 1 && parseInt(customHours, 10) <= 365 * 24));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateTemplateName(name, existingNames)) {
      if (name.length === 0) setFormError('Name is required');
      else if (name.length > 100) setFormError('Name must be 100 characters or fewer');
      else setFormError('A template with this name already exists');
      return;
    }
    setFormError(null);
    insertMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BookMarked className="w-6 h-6 text-primary" />
          {uiI18n.t('app.ban_templates_0b8a6f6d')}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1.5 text-xs">
            <PlusCircle className="w-3.5 h-3.5" /> {uiI18n.t('app.new_template_dcfa4621')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-2 text-muted-foreground">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> {uiI18n.t('app.refresh_56e3badc')}
          </Button>
        </div>
      </div>

      {showForm && (
        <GlassPanel className="p-5 border-white/10">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><PlusCircle className="w-4 h-4 text-primary" /> {uiI18n.t('app.save_template_2d7eec43')}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">{formError}</p>}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiI18n.t('app.template_name_fb32ea3e')}</label>
              <input type="text" value={name} onChange={(e) => { setName(e.target.value); setFormError(null); }} maxLength={100}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={uiI18n.t('app.e_g_spam_7_day_ban_3940e74a')} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiI18n.t('app.reason_0c76fd5d')}</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                placeholder={uiI18n.t('app.reason_text_for_this_template_84a424f7')} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiI18n.t('app.duration_1370004d')}</label>
              <ThemedSelect value={durationPreset} onChange={(e) => setDurationPreset(e.target.value as any)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="permanent">{uiI18n.t('app.permanent_af0fa7cd')}</option>
                <option value="7d">{uiI18n.t('app.7_days_0a8dd6ad')}</option>
                <option value="30d">{uiI18n.t('app.30_days_7d4278a8')}</option>
                <option value="custom">{uiI18n.t('app.custom_hours_4b0db536')}</option>
              </ThemedSelect>
              {durationPreset === 'custom' && (
                <input type="number" value={customHours} onChange={(e) => setCustomHours(e.target.value)} min={1} max={8760}
                  placeholder={uiI18n.t('app.hours_1_8760_1febd226')} className="w-full mt-2 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary" />
              )}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" size="sm" disabled={!isFormValid || insertMutation.isPending} className="gap-1.5">
                {insertMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookMarked className="w-3.5 h-3.5" />} {uiI18n.t('app.save_template_2d7eec43')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); setFormError(null); }} className="text-muted-foreground">{uiI18n.t('app.cancel_77dfd213')}</Button>
            </div>
          </form>
        </GlassPanel>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" /></div>
      ) : isError ? (
        <GlassPanel className="p-10 text-center border-destructive/20 bg-destructive/5">
          <XCircle className="w-8 h-8 text-destructive/50 mx-auto mb-3" />
          <p className="text-sm font-medium text-destructive mb-4">{uiI18n.t('app.failed_to_load_templates_9b1f1478')}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive"><RefreshCw className="w-4 h-4" /> {uiI18n.t('app.retry_9f5cd8a2')}</Button>
        </GlassPanel>
      ) : !templates || templates.length === 0 ? (
        <GlassPanel className="p-12 text-center border-dashed border-white/5">
          <BookMarked className="w-10 h-10 text-muted-foreground/25 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{uiI18n.t('app.no_templates_saved_yet_5fc47d6f')}</p>
        </GlassPanel>
      ) : (
        <GlassPanel className="border-white/5">
          <div className="divide-y divide-white/5">
            {templates.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-4 p-4 hover:bg-white/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.reason}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {t.duration_hours === null ? uiI18n.t('app.permanent_af0fa7cd') : t.duration_hours >= 168 ? uiI18n.t('app.i18n_value_0_days_e4839655', { value0: Math.round(t.duration_hours / 24) }) : uiI18n.t('app.i18n_value_0h_2228e3d5', { value0: t.duration_hours })}
                  </p>
                </div>
                {confirmDeleteId === t.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{uiI18n.t('app.confirm_9150df52')}</span>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)} className="text-xs h-7 text-muted-foreground">{uiI18n.t('app.cancel_77dfd213')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(t.id)} disabled={deleteMutation.isPending} className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 text-xs h-7">
                      {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} {uiI18n.t('app.delete_f6fdbe48')}
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(t.id)} className="shrink-0 text-muted-foreground hover:text-destructive gap-1 text-xs h-7">
                    <Trash2 className="w-3 h-3" /> {uiI18n.t('app.delete_f6fdbe48')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
