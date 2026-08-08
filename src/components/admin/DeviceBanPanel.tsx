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
import { format } from 'date-fns';
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
      toast.success('Device banned successfully');
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already')) {
        setFormError('This device is already banned');
      } else {
        toast.error(`Failed to ban device: ${msg}`);
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
      toast.success('Device ban removed');
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to remove ban: ${msg}`);
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
          Device Bans
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            className="gap-1.5 text-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Add Ban
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <GlassPanel className="p-5 border-white/10">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-primary" />
            Ban Device
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
                {formError}
              </p>
            )}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Device ID <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => { setDeviceId(e.target.value); setFormError(null); }}
                placeholder="Enter device identifier (1–255 chars)"
                maxLength={255}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm font-mono text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {deviceId && (deviceId.length < 1 || deviceId.length > 255) && (
                <p className="text-xs text-destructive">Must be 1–255 characters</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Reason <span className="text-destructive">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => { setReason(e.target.value); setFormError(null); }}
                placeholder="Reason for banning this device…"
                maxLength={500}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <p className="text-xs text-muted-foreground/50 text-right">{reason.length}/500</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Expiry (optional)
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
                Ban Device
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowForm(false); setDeviceId(''); setReason(''); setExpiresAt(''); setFormError(null); }}
                className="text-muted-foreground"
              >
                Cancel
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
          <p className="text-sm font-medium text-destructive mb-4">Failed to load device bans</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </GlassPanel>
      ) : !bans || bans.length === 0 ? (
        <GlassPanel className="p-12 text-center border-dashed border-white/5">
          <Shield className="w-10 h-10 text-muted-foreground/25 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No active device bans</p>
        </GlassPanel>
      ) : (
        <GlassPanel className="border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Device ID</th>
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Reason</th>
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Banned By</th>
                  <th className="text-left py-3 px-4 text-xs text-muted-foreground font-medium uppercase tracking-wide">Expires</th>
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
                          : 'Permanent'}
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
                          Remove
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
