import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<MemoryProfile>(() => getMemoryProfile());
  const [reclaiming, setReclaiming] = useState(false);

  // Reflect changes made elsewhere (other tab / programmatic) in the selector.
  useEffect(() => subscribeMemoryProfile(setProfile), []);

  const handleProfileChange = (value: string) => {
    const next = value as MemoryProfile;
    setProfile(next);
    setMemoryProfile(next);
    toast.success(uiI18n.t('app.memory_profile_set_to_i18n_value_0_27b39b9c', { value0: next }), {
      get description() { return uiI18n.t('app.buffers_and_caches_update_right_away_restart_the_359069b7'); },
    });
  };

  const handleFreeMemory = async () => {
    setReclaiming(true);
    try {
      const result = await reclaimRendererMemory(queryClient);
      const closed = result.main?.contextsClosed ?? 0;
      toast.success(uiI18n.t('app.memory_reclaimed_b33745c4'), {
        description:
          closed > 0
            ? `Cleared in-memory caches and closed ${closed} idle browser context${closed === 1 ? '' : 's'}.`
            : 'Cleared in-memory caches and dropped inactive data.',
      });
    } catch {
      toast.error(uiI18n.t('app.could_not_reclaim_memory_0cce931b'));
    } finally {
      setReclaiming(false);
    }
  };

  return (
    <SettingsSection
      icon={Cpu}
      eyebrow="Performance"
      title={uiI18n.t('app.memory_performance_56805311')}
      description={uiI18n.t('app.control_how_much_ram_tatakai_uses_lower_profiles_97ccd009')}
    >
      <div className="space-y-1">
        <SettingRow
          title={uiI18n.t('app.memory_profile_bbe89630')}
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
                <SelectItem value="low">{uiI18n.t('app.low_a124947c')}</SelectItem>
                <SelectItem value="balanced">{uiI18n.t('app.balanced_03342dbb')}</SelectItem>
                <SelectItem value="unlimited">{uiI18n.t('app.unlimited_b8bef37b')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />

        <SettingRow
          title={uiI18n.t('app.free_memory_now_30e6cd3c')}
          description={uiI18n.t('app.clear_rebuildable_in_memory_caches_drop_off_scre_4dab99f3')}
          control={
            <Button
              variant="outline"
              size="sm"
              onClick={handleFreeMemory}
              disabled={reclaiming}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {reclaiming ? uiI18n.t('app.freeing_86bb725c') : uiI18n.t('app.free_memory_now_30e6cd3c')}
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
