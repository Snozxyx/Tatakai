import { useState } from 'react';
import { Globe, Eye, EyeOff, Shield, ShieldAlert, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCountryPolicy } from '@/core/country-policy/useCountryPolicy';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function CountryPolicyPanel() {
  const policy = useCountryPolicy();
  const [refreshKey, setRefreshKey] = useState(0);

  const isPermitted = policy.badge.label === 'Permitted';
  const isUnknown = policy.badge.label === 'Unknown';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              isPermitted
                ? 'bg-emerald-500/10 text-emerald-400'
                : isUnknown
                ? 'bg-zinc-500/10 text-zinc-400'
                : 'bg-amber-500/10 text-amber-400',
            )}
          >
            {isPermitted ? (
              <Shield className="w-5 h-5" />
            ) : (
              <ShieldAlert className="w-5 h-5" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Country Policy</h3>
            <p className="text-xs text-muted-foreground">
              Torrent legality in your region
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-muted-foreground hover:text-foreground"
          onClick={() => setRefreshKey((k) => k + 1)}
          title="Re-check location"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Status Card */}
      <motion.div
        key={refreshKey}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'rounded-2xl border p-4 space-y-3',
          isPermitted
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : isUnknown
            ? 'bg-zinc-500/5 border-zinc-500/20'
            : 'bg-amber-500/5 border-amber-500/20',
        )}
      >
        {policy.loading ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Detecting location…</span>
          </div>
        ) : (
          <>
            {/* Country row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Country</span>
              </div>
              <span className="text-sm font-semibold text-foreground">
                {policy.countryName || policy.countryCode || 'Unknown'}
              </span>
            </div>

            {/* IP row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-mono text-xs">IP</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-foreground">
                  {policy.displayedIp || '—'}
                </span>
                <button
                  type="button"
                  onClick={() => policy.setRevealIp(!policy.revealIp)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={policy.revealIp ? 'Hide IP' : 'Reveal IP'}
                >
                  {policy.revealIp ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Status badge */}
            <div className="flex items-center justify-between pt-1 border-t border-border/30">
              <span className="text-xs text-muted-foreground">Torrent legality</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={policy.badge.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-semibold',
                    policy.badge.tone,
                  )}
                >
                  {policy.badge.label}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* Policy note */}
            {policy.policy?.note && (
              <p className="text-xs text-muted-foreground italic pt-1">
                {policy.policy.note}
              </p>
            )}
          </>
        )}
      </motion.div>

      {/* Non-blocking info */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        This is informational only. Tatakai does not block features based on country — you remain responsible for compliance with local laws.
      </p>

      {/* VPN suggestion */}
      {!isPermitted && !policy.loading && (
        <a
          href="https://one.one.one.one/dns/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors group"
        >
          <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          Learn about WARP by Cloudflare for private DNS
        </a>
      )}
    </div>
  );
}
