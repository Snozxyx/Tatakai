import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
// BulkBanToolbar — Requirements 11.1–11.6
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { toast } from 'sonner';
import { Ban, Loader2, X } from 'lucide-react';

interface SelectedUser {
  id: string;
  display_name: string;
}

interface BulkBanToolbarProps {
  selectedUsers: SelectedUser[];
  onComplete: () => void;
}

export function BulkBanToolbar({ selectedUsers, onComplete }: BulkBanToolbarProps) {
  useUiTranslation();
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [durationPreset, setDurationPreset] = useState<'permanent' | '7d' | '30d' | 'custom'>('permanent');
  const [customDays, setCustomDays] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  if (selectedUsers.length === 0) return null;

  const getDurationHours = (): number | null => {
    if (durationPreset === 'permanent') return null;
    if (durationPreset === '7d') return 168;
    if (durationPreset === '30d') return 720;
    const days = parseInt(customDays, 10);
    if (!isNaN(days) && days >= 1 && days <= 365) return days * 24;
    return null;
  };

  const customValid =
    durationPreset !== 'custom' ||
    (parseInt(customDays, 10) >= 1 && parseInt(customDays, 10) <= 365);

  const formValid = reason.trim().length >= 1 && reason.trim().length <= 500 && customValid;

  const handleBulkBan = async () => {
    if (!formValid) return;
    setProcessing(true);
    setProgress(0);

    const hours = getDurationHours();
    const failedUsers: string[] = [];

    for (let i = 0; i < selectedUsers.length; i++) {
      const user = selectedUsers[i];
      try {
        const { error } = await supabase.rpc('ban_user', {
          target_user_id: user.id,
          reason: reason.trim(),
          duration_hours: hours,
        });
        if (error) throw error;
      } catch {
        failedUsers.push(user.display_name);
      }
      setProgress(i + 1);
    }

    setProcessing(false);
    setShowDialog(false);
    setReason('');
    setDurationPreset('permanent');
    setCustomDays('');

    const successCount = selectedUsers.length - failedUsers.length;
    toast.success(uiI18n.t('app.banned_i18n_value_0_useri18n_value_1_successfull_1ec145c9', { value0: successCount, value1: successCount !== 1 ? 's' : '' }), { duration: 5000 });

    if (failedUsers.length > 0) {
      toast.error(uiI18n.t('app.failed_to_ban_i18n_value_0_e01f7fe4', { value0: failedUsers.join(', ') }), { duration: 0 });
    }

    onComplete();
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 mb-4">
        <span className="text-sm font-medium text-primary">{selectedUsers.length} {uiI18n.t('app.user_12dea96f')}{selectedUsers.length !== 1 ? 's' : ''} {uiI18n.t('app.selected_835f3b50')}</span>
        <Button size="sm" variant="destructive" onClick={() => setShowDialog(true)} className="gap-1.5 text-xs ml-auto">
          <Ban className="w-3.5 h-3.5" /> {uiI18n.t('app.bulk_ban_ff98057a')}
        </Button>
      </div>

      {/* Dialog overlay */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassPanel className="w-full max-w-md p-6 border-white/20 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Ban className="w-5 h-5 text-destructive" /> {uiI18n.t('app.bulk_ban_ff98057a')} {selectedUsers.length} {uiI18n.t('app.users_57f2b181')}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => !processing && setShowDialog(false)} className="w-7 h-7 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {processing ? (
              <div className="space-y-3 text-center py-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <p className="text-sm font-medium">{uiI18n.t('app.processing_e63451d3')} {progress} {uiI18n.t('app.of_de04fa0e')} {selectedUsers.length}</p>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${(progress / selectedUsers.length) * 100}%` }} />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiI18n.t('app.shared_reason_807a9076')}</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
                    placeholder={uiI18n.t('app.reason_for_banning_all_selected_users_42b8c4e4')}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                  <p className="text-xs text-muted-foreground/50 text-right">{reason.length}/500</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiI18n.t('app.duration_1370004d')}</label>
                  <ThemedSelect value={durationPreset} onChange={(e) => setDurationPreset(e.target.value as any)}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="permanent">{uiI18n.t('app.permanent_af0fa7cd')}</option>
                    <option value="7d">{uiI18n.t('app.7_days_0a8dd6ad')}</option>
                    <option value="30d">{uiI18n.t('app.30_days_7d4278a8')}</option>
                    <option value="custom">{uiI18n.t('app.custom_1_365_days_f0c1147c')}</option>
                  </ThemedSelect>
                  {durationPreset === 'custom' && (
                    <input type="number" value={customDays} onChange={(e) => setCustomDays(e.target.value)} min={1} max={365}
                      placeholder={uiI18n.t('app.days_1_365_6cbc317d')} className="w-full mt-2 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary" />
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button onClick={handleBulkBan} disabled={!formValid} className="gap-1.5 bg-destructive hover:bg-destructive/90 flex-1">
                    <Ban className="w-3.5 h-3.5" /> {uiI18n.t('app.ban_bfa1bfbf')} {selectedUsers.length} {uiI18n.t('app.users_57f2b181')}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-muted-foreground">{uiI18n.t('app.cancel_77dfd213')}</Button>
                </div>
              </>
            )}
          </GlassPanel>
        </div>
      )}
    </>
  );
}
