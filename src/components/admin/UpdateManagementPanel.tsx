import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  RefreshCw,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowDownCircle,
  RotateCcw,
  PlusCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { UpdatePolicy, CreatePolicyForm } from '@/types/admin-dashboard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const DUPLICATE_ACTIVE_CONSTRAINT = 'update_policies_one_active_per_channel';

const INITIAL_FORM: CreatePolicyForm = {
  channel: 'stable',
  type: 'mandatory',
  target_version: '',
  rollback_from_version: '',
  notes: '',
};

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------
const QUERY_KEY = ['admin_update_policies'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CHANNEL_COLOURS: Record<UpdatePolicy['channel'], string> = {
  stable: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  beta: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  experimental: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

const TYPE_COLOURS: Record<UpdatePolicy['type'], string> = {
  mandatory: 'bg-red-500/15 text-red-400 border-red-500/30',
  recommended: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  experimental: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  rollback: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

const TypeIcon = ({ type }: { type: UpdatePolicy['type'] }) => {
  switch (type) {
    case 'mandatory':
      return <AlertTriangle className="w-3.5 h-3.5" />;
    case 'rollback':
      return <RotateCcw className="w-3.5 h-3.5" />;
    default:
      return <ArrowDownCircle className="w-3.5 h-3.5" />;
  }
};

// ---------------------------------------------------------------------------
// Form validation helper
// ---------------------------------------------------------------------------
function isFormValid(form: CreatePolicyForm): boolean {
  if (!SEMVER_RE.test(form.target_version)) return false;
  if (form.type === 'rollback' && !SEMVER_RE.test(form.rollback_from_version ?? '')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function UpdateManagementPanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreatePolicyForm>(INITIAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // ------------------------------------------------------------------
  // Fetch
  // ------------------------------------------------------------------
  const {
    data: policies,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<UpdatePolicy[]> => {
      const { data, error } = await supabase
        .from('update_policies')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as UpdatePolicy[];
    },
  });

  // ------------------------------------------------------------------
  // Create mutation
  // ------------------------------------------------------------------
  const createMutation = useMutation({
    mutationFn: async (payload: CreatePolicyForm) => {
      const { error } = await supabase.from('update_policies').insert({
        channel: payload.channel,
        type: payload.type,
        target_version: payload.target_version,
        rollback_from_version: payload.type === 'rollback' ? payload.rollback_from_version : null,
        notes: payload.notes || null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setForm(INITIAL_FORM);
      setFormError(null);
      setShowForm(false);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes(DUPLICATE_ACTIVE_CONSTRAINT) || msg.includes('unique') || msg.includes('duplicate')) {
        setFormError('A channel can only have one active policy at a time. Deactivate the existing policy first.');
      } else {
        toast.error(`Failed to create policy: ${msg}`);
      }
    },
  });

  const handleFormChange = (field: keyof CreatePolicyForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid(form)) return;
    createMutation.mutate(form);
  };

  // ------------------------------------------------------------------
  // Deactivate mutation
  // ------------------------------------------------------------------
  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('update_policies')
        .update({ active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to deactivate policy: ${message}`);
    },
  });

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------
  const renderCreateForm = () => (
    <GlassPanel className="p-5 border-white/10">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <PlusCircle className="w-4 h-4 text-primary" />
        New Update Policy
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Inline constraint error */}
        {formError && (
          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
            {formError}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Channel */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Channel</label>
            <select
              value={form.channel}
              onChange={e => handleFormChange('channel', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="stable">stable</option>
              <option value="beta">beta</option>
              <option value="experimental">experimental</option>
            </select>
          </div>

          {/* Type */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Type</label>
            <select
              value={form.type}
              onChange={e => handleFormChange('type', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="mandatory">mandatory</option>
              <option value="recommended">recommended</option>
              <option value="experimental">experimental</option>
              <option value="rollback">rollback</option>
            </select>
          </div>

          {/* Target version */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Target Version <span className="text-muted-foreground/50">(e.g. 1.2.3)</span>
            </label>
            <input
              type="text"
              value={form.target_version}
              onChange={e => handleFormChange('target_version', e.target.value)}
              placeholder="1.2.3"
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm font-mono text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {form.target_version && !SEMVER_RE.test(form.target_version) && (
              <p className="text-xs text-destructive">Must match format X.Y.Z</p>
            )}
          </div>

          {/* Rollback from version — only when type = rollback */}
          {form.type === 'rollback' && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Rollback From Version <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={form.rollback_from_version ?? ''}
                onChange={e => handleFormChange('rollback_from_version', e.target.value)}
                placeholder="1.3.0"
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm font-mono text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {form.rollback_from_version && !SEMVER_RE.test(form.rollback_from_version) && (
                <p className="text-xs text-destructive">Must match format X.Y.Z</p>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Notes (optional)</label>
          <textarea
            value={form.notes ?? ''}
            onChange={e => handleFormChange('notes', e.target.value)}
            rows={2}
            placeholder="Release notes or reason for this policy…"
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            type="submit"
            size="sm"
            disabled={!isFormValid(form) || createMutation.isPending}
            className="gap-1.5"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlusCircle className="w-3.5 h-3.5" />
            )}
            Create Policy
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setShowForm(false); setForm(INITIAL_FORM); setFormError(null); }}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
        </div>
      </form>
    </GlassPanel>
  );

  const renderLoadingState = () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" />
    </div>
  );

  const renderErrorState = () => (
    <GlassPanel className="p-12 text-center border-destructive/20 bg-destructive/5">
      <XCircle className="w-10 h-10 text-destructive/50 mx-auto mb-4" />
      <p className="text-sm font-medium text-destructive mb-4">
        Failed to load update policies
      </p>
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
  );

  const renderEmptyState = () => (
    <GlassPanel className="p-16 text-center border-dashed border-white/5">
      <ArrowDownCircle className="w-10 h-10 text-muted-foreground/25 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground font-medium">
        No update policies found.
      </p>
    </GlassPanel>
  );

  const renderPolicyRow = (policy: UpdatePolicy) => (
    <GlassPanel
      key={policy.id}
      className="p-4 hover:bg-white/5 border-white/5 transition-all duration-200"
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Left: badges + versions */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Channel + Type badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${CHANNEL_COLOURS[policy.channel]}`}
            >
              {policy.channel}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${TYPE_COLOURS[policy.type]}`}
            >
              <TypeIcon type={policy.type} />
              {policy.type}
            </span>
            {/* Active / Inactive badge */}
            {policy.active ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                <CheckCircle2 className="w-3 h-3" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border bg-muted/20 text-muted-foreground border-white/10">
                <XCircle className="w-3 h-3" />
                Inactive
              </span>
            )}
          </div>

          {/* Version info */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground text-xs uppercase tracking-wide font-bold mr-1">
                Target
              </span>
              <span className="font-mono font-semibold">
                v{policy.target_version}
              </span>
            </span>
            {policy.rollback_from_version && (
              <span>
                <span className="text-muted-foreground text-xs uppercase tracking-wide font-bold mr-1">
                  Rollback from
                </span>
                <span className="font-mono font-semibold text-orange-400">
                  v{policy.rollback_from_version}
                </span>
              </span>
            )}
          </div>

          {/* Notes */}
          {policy.notes && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {policy.notes}
            </p>
          )}

          {/* Published at */}
          <p className="text-[11px] text-muted-foreground/70">
            Published{' '}
            {formatDistanceToNow(new Date(policy.published_at), {
              addSuffix: true,
            })}{' '}
            &nbsp;·&nbsp;{' '}
            {new Date(policy.published_at).toLocaleString()}
          </p>
        </div>

        {/* Right: deactivate action */}
        {policy.active && (
          <div className="flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => deactivateMutation.mutate(policy.id)}
              disabled={deactivateMutation.isPending}
              className="gap-1.5 border-destructive/30 hover:bg-destructive/10 text-destructive hover:text-destructive text-xs"
            >
              {deactivateMutation.isPending &&
              deactivateMutation.variables === policy.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              Deactivate
            </Button>
          </div>
        )}
      </div>
    </GlassPanel>
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ArrowDownCircle className="w-6 h-6 text-primary" />
          Update Policies
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(v => !v)}
            className="gap-1.5 text-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            New Policy
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

      {/* Create policy form */}
      {showForm && renderCreateForm()}

      {/* Content */}
      {isLoading
        ? renderLoadingState()
        : isError
          ? renderErrorState()
          : !policies || policies.length === 0
            ? renderEmptyState()
            : (
              <div className="space-y-3">
                {policies.map(renderPolicyRow)}
              </div>
            )}
    </div>
  );
}
