import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Loader2,
  RefreshCw,
  XCircle,
  Shield,
  Trash2,
  PlusCircle,
} from 'lucide-react';
import { format } from '@/lib/localeFormat';
import { validateDeviceBan, truncateDeviceId } from '@/utils/banUtils';
import type { DeviceBan } from '@/types/admin-dashboard';

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------
const QUERY_KEY = ['admin_device_bans'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function DeviceBanPanel() {
  useUiTranslation();
  const queryClient = useQueryClient();

  // Form state
  const [deviceId, setDeviceId] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch active bans
  // ---------------------------------------------------------------------------
  const { data: bans, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<DeviceBan[]> => {
      const { data, error } = await (supabase
        .from('device_bans' as any)
        .select('*')
        .order('created_at', { ascending: false }) as any);
      if (error) throw error;
      return (data ?? []) as DeviceBan[];
    },
  });

  // ---------------------------------------------------------------------------
  // Insert mutation
  // ---------------------------------------------------------------------------
  const insertMutation = useMutation({
    mutationFn: async () => {
      const { data: currentUser } = await supabase.auth.getUser();
      const { error } = await (supabase
        .from('device_bans' as any)
        .insert({
          device_id: deviceId,
          reason,
          banned_by: currentUser.user?.id,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setDeviceId('');
      setReason('');
      setExpiresAt('');
      setFormError(null);
      setShowForm(false);
      toast.success(uiI18n.t('app.device_banned_successfully_f6b92b8f'));
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already')) {
        setFormError('This device is already banned');
      } else {
        toast.error(uiI18n.t('app.failed_to_ban_device_i18n_value_0_b6a984bf', { value0: msg }));
      }
    },
  });

  // ---------------------------------------------------------------------------
  // Remove mutation
  // ---------------------------------------------------------------------------
  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase
        .from('device_bans' as any)
        .delete()
        .eq('id', id) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(uiI18n.t('app.device_ban_removed_5d41d524'));
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(uiI18n.t('app.failed_to_remove_ban_i18n_value_0_7a9835e4', { value0: msg }));
    },
  });

  // ---------------------------------------------------------------------------
  // Validation & submit
  // ---------------------------------------------------------------------------
  const isFormValid = validateDeviceBan(deviceId, reason);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!isFormValid) return;
    insertMutation.mutate();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          {uiI18n.t('app.device_bans_5acbaebf')}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            className="gap-1.5 text-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            {uiI18n.t('app.add_ban_d743fc07')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {uiI18n.t('app.refresh_56e3badc')}
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <GlassPanel className="p-5 border-white/10">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-primary" />
            {uiI18n.t('app.ban_device_df15e6de')}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
                {formError}
              </p>
            )}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {uiI18n.t('app.device_id_7c9f0f8d')} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => { setDeviceId(e.target.value); setFormError(null); }}
                placeholder={uiI18n.t('app.enter_device_identifier_1_255_chars_42594e6f')}
                maxLength={255}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm font-mono text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {deviceId && (deviceId.length < 1 || deviceId.length > 255) && (
                <p className="text-xs text-destructive">{uiI18n.t('app.must_be_1_255_characters_e68812ba')}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {uiI18n.t('app.reason_f219cc06')} <span className="text-destructive">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => { setReason(e.target.value); setFormError(null); }}
                placeholder={uiI18n.t('app.reason_for_banning_this_device_d3adb200')}
                maxLength={500}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <p className="text-xs text-muted-foreground/50 text-right">{reason.length}/500</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {uiI18n.t('app.expiry_optional_728bac66')}
              </label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="submit"
                size="sm"
                disabled={!isFormValid || insertMutation.isPending}
                className="gap-1.5"
              >
                {insertMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Shield className="w-3.5 h-3.5" />
                )}
                {uiI18n.t('app.ban_device_df15e6de')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowForm(false); setDeviceId(''); setReason(''); setExpiresAt(''); setFormError(null); }}
                className="text-muted-foreground"
              >
                {uiI18n.t('app.cancel_77dfd213')}
              </Button>
            </div>
          </form>
        </GlassPanel>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
        </div>
      ) : isError ? (
        <GlassPanel className="p-10 text-center border-destructive/20 bg-destructive/5">
          <XCircle className="w-8 h-8 text-destructive/50 mx-auto mb-3" />
          <p className="text-sm font-medium text-destructive mb-4">{uiI18n.t('app.failed_to_load_device_bans_fba5b7b5')}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive"
          >
            <RefreshCw className="w-4 h-4" />
            {uiI18n.t('app.retry_9f5cd8a2')}
          </Button>
        </GlassPanel>
      ) : !bans || bans.length === 0 ? (
        <GlassPanel className="p-12 text-center border-dashed border-white/5">
          <Shield className="w-10 h-10 text-muted-foreground/25 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{uiI18n.t('app.no_active_device_bans_29d114b1')}</p>
        </GlassPanel>
      ) : (
        <GlassPanel className="border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiI18n.t('app.device_id_7c9f0f8d')}</th>
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiI18n.t('app.reason_f219cc06')}</th>
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiI18n.t('app.banned_by_b5d48b82')}</th>
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiI18n.t('app.expires_a99be3da')}</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {bans.map((ban) => {
                  const { display, full } = truncateDeviceId(ban.device_id);
                  return (
                    <tr key={ban.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs" title={full}>
                        {display}
                        {full.length > 20 && <span className="text-muted-foreground">…</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-[200px] truncate" title={ban.reason}>
                        {ban.reason}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                        {ban.banned_by ? ban.banned_by.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        {ban.expires_at
                          ? format(new Date(ban.expires_at), 'MMM d, yyyy HH:mm')
                          : uiI18n.t('app.permanent_af0fa7cd')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMutation.mutate(ban.id)}
                          disabled={removeMutation.isPending && removeMutation.variables === ban.id}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 text-xs"
                        >
                          {removeMutation.isPending && removeMutation.variables === ban.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          {uiI18n.t('app.remove_e963907d')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
