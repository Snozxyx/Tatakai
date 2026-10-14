import type { UpdateState } from './update-monitor';
import type { MobileUpdateState } from './mobile-update';
export interface NormalizedUpdateState {
  installedVersion: string;
  latestVersion?: string;
  channel: string;
  phase: string;
  releaseNotes?: string;
  policy: 'mandatory' | 'standard';
  eligibility: 'offered' | 'not-offered' | 'unknown';
  rolloutPercentage?: number;
  progress?: number;
  checkedAt?: number;
  error?: string;
}
export function normalizeUpdateState(state: UpdateState | MobileUpdateState, installedVersion: string): NormalizedUpdateState {
  const desktop = state as UpdateState;
  const mobile = state as MobileUpdateState;
  return {
    installedVersion: mobile.currentVersion || installedVersion,
    latestVersion: desktop.version || mobile.latestVersion,
    channel: state.channel || 'stable', phase: state.phase, releaseNotes: state.releaseNotes,
    policy: desktop.mandatory ? 'mandatory' : 'standard', eligibility: state.eligibility || 'unknown',
    rolloutPercentage: state.stagingPercentage, progress: state.progress,
    checkedAt: state.checkedAt, error: state.phase === 'error' ? state.message : undefined,
  };
}
