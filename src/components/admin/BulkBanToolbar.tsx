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
    toast.success(`Banned ${successCount} user${successCount !== 1 ? 's' : ''} successfully`, { duration: 5000 });

    if (failedUsers.length > 0) {
      toast.error(`Failed to ban: ${failedUsers.join(', ')}`, { duration: 0 });
    }

    onComplete();
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 mb-4">
        <span className="text-sm font-medium text-primary">{selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected</span>
        <Button size="sm" variant="destructive" onClick={() => setShowDialog(true)} className="gap-1.5 text-xs ml-auto">
          <Ban className="w-3.5 h-3.5" /> Bulk Ban
        </Button>
      </div>

      {/* Dialog overlay */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassPanel className="w-full max-w-md p-6 border-white/20 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Ban className="w-5 h-5 text-destructive" /> Bulk Ban {selectedUsers.length} Users
              </h3>
              <Button variant="ghost" size="sm" onClick={() => !processing && setShowDialog(false)} className="w-7 h-7 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {processing ? (
              <div className="space-y-3 text-center py-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <p className="text-sm font-medium">Processing {progress} of {selectedUsers.length}</p>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${(progress / selectedUsers.length) * 100}%` }} />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Shared Reason *</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
                    placeholder="Reason for banning all selected users…"
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                  <p className="text-xs text-muted-foreground/50 text-right">{reason.length}/500</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Duration</label>
                  <select value={durationPreset} onChange={(e) => setDurationPreset(e.target.value as any)}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="permanent">Permanent</option>
                    <option value="7d">7 days</option>
                    <option value="30d">30 days</option>
                    <option value="custom">Custom (1–365 days)</option>
                  </select>
                  {durationPreset === 'custom' && (
                    <input type="number" value={customDays} onChange={(e) => setCustomDays(e.target.value)} min={1} max={365}
                      placeholder="Days (1–365)" className="w-full mt-2 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary" />
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button onClick={handleBulkBan} disabled={!formValid} className="gap-1.5 bg-destructive hover:bg-destructive/90 flex-1">
                    <Ban className="w-3.5 h-3.5" /> Ban {selectedUsers.length} Users
                  </Button>
                  <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-muted-foreground">Cancel</Button>
                </div>
              </>
            )}
          </GlassPanel>
        </div>
      )}
    </>
  );
}
