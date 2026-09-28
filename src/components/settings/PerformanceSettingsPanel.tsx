/**
 * src/components/settings/PerformanceSettingsPanel.tsx
 * ------------------------------------------------------------------------------
 * The "Performance" section of native App Settings. Three controls:
 *   1. Memory profile (Low / Balanced / Unlimited) — the master knob from
 *      src/lib/memoryProfile.ts. Buffers/caches shrink immediately; the V8 heap
 *      cap only changes at the next launch, so we surface a restart hint.
 *   2. Live memory metrics — the previously-orphaned PerfMetricsPanel.
 *   3. "Free memory now" — the manual reclaim (renderer caches + inactive
 *      queries + main-side idle CF contexts / GC).
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Cpu, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { SettingsSection, SettingRow } from '@/components/settings/SettingsPrimitives';
import { PerfMetricsPanel } from '@/components/desktop/PerfMetricsPanel';
import {
  type MemoryProfile,
  getMemoryProfile,
  setMemoryProfile,
  subscribeMemoryProfile,
} from '@/lib/memoryProfile';
import { reclaimRendererMemory } from '@/lib/memoryReclaim';

const PROFILE_DESCRIPTIONS: Record<MemoryProfile, string> = {
  low: 'Smallest footprint. Tiny media buffers and aggressive cache limits — best for low-RAM machines.',
  balanced: 'The default. Noticeably lower steady-state RAM than Unlimited with no visible change to playback or reading.',
  unlimited: 'The app’s original behaviour: large buffers and caches for maximum smoothness. Uses the most RAM.',
};

export function PerformanceSettingsPanel() {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<MemoryProfile>(() => getMemoryProfile());
  const [reclaiming, setReclaiming] = useState(false);

  // Reflect changes made elsewhere (other tab / programmatic) in the selector.
  useEffect(() => subscribeMemoryProfile(setProfile), []);

  const handleProfileChange = (value: string) => {
    const next = value as MemoryProfile;
    setProfile(next);
    setMemoryProfile(next);
    toast.success(`Memory profile set to ${next}`, {
      description: 'Buffers and caches update right away. Restart the app to apply the memory cap.',
    });
  };

  const handleFreeMemory = async () => {
    setReclaiming(true);
    try {
      const result = await reclaimRendererMemory(queryClient);
      const closed = result.main?.contextsClosed ?? 0;
      toast.success('Memory reclaimed', {
        description:
          closed > 0
            ? `Cleared in-memory caches and closed ${closed} idle browser context${closed === 1 ? '' : 's'}.`
            : 'Cleared in-memory caches and dropped inactive data.',
      });
    } catch {
      toast.error('Could not reclaim memory');
    } finally {
      setReclaiming(false);
    }
  };

  return (
    <SettingsSection
      icon={Cpu}
      eyebrow="Performance"
      title="Memory & performance"
      description="Control how much RAM Tatakai uses. Lower profiles shrink media buffers and in-memory caches; nothing is removed — Unlimited restores the original behaviour."
    >
      <div className="space-y-1">
        <SettingRow
          title="Memory profile"
          description={PROFILE_DESCRIPTIONS[profile]}
          control={({ labelId, descriptionId }) => (
            <Select value={profile} onValueChange={handleProfileChange}>
              <SelectTrigger
                className="w-40"
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="unlimited">Unlimited</SelectItem>
              </SelectContent>
            </Select>
          )}
        />

        <SettingRow
          title="Free memory now"
          description="Clear rebuildable in-memory caches, drop off-screen data, and close idle browser contexts. Playback and the current page are unaffected."
          control={
            <Button
              variant="outline"
              size="sm"
              onClick={handleFreeMemory}
              disabled={reclaiming}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {reclaiming ? 'Freeing…' : 'Free memory now'}
            </Button>
          }
        />

        <div className="pt-2">
          <PerfMetricsPanel />
        </div>
      </div>
    </SettingsSection>
  );
}

export default PerformanceSettingsPanel;
