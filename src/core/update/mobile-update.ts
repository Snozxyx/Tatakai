import { useEffect, useSyncExternalStore } from 'react';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { toast } from 'sonner';
import { compareAppVersions } from './version';

export const MOBILE_RELEASES_URL = 'https://github.com/Snozxyx/Tatakai/releases/latest';
const LATEST_RELEASE_API = 'https://api.github.com/repos/Snozxyx/Tatakai/releases/latest';

export type MobileUpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'error';

export interface MobileUpdateState {
  phase: MobileUpdatePhase;
  currentVersion?: string;
  latestVersion?: string;
  releaseUrl: string;
  checkedAt?: number;
  message?: string;
}

const INITIAL_STATE: MobileUpdateState = {
  phase: 'idle',
  releaseUrl: MOBILE_RELEASES_URL,
};

let state = INITIAL_STATE;
let checkInFlight: Promise<MobileUpdateState> | null = null;
const listeners = new Set<() => void>();

function publish(patch: Partial<MobileUpdateState>): MobileUpdateState {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
  return state;
}

export async function openMobileReleasePage(url = state.releaseUrl): Promise<void> {
  const target = /^https:\/\//i.test(url) ? url : MOBILE_RELEASES_URL;
  try {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: target });
      return;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  } catch {
    window.open(target, '_blank', 'noopener,noreferrer');
  }
}

type CheckOptions = { announce?: boolean };

export async function checkMobileUpdate(
  options: CheckOptions = {},
): Promise<MobileUpdateState> {
  if (checkInFlight) return checkInFlight;

  checkInFlight = (async () => {
    publish({ phase: 'checking', message: undefined });
    try {
      const app = await App.getInfo();
      const currentVersion = String(app.version || '').replace(/^v/i, '');
      const response = await CapacitorHttp.get({
        url: LATEST_RELEASE_API,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`GitHub release check returned HTTP ${response.status}`);
      }

      const latestVersion = String(response.data?.tag_name || '').replace(/^v/i, '');
      if (!latestVersion) throw new Error('Latest release did not include a version tag');
      const releaseUrl = String(response.data?.html_url || MOBILE_RELEASES_URL);
      const available = compareAppVersions(latestVersion, currentVersion) > 0;
      const next = publish({
        phase: available ? 'available' : 'current',
        currentVersion,
        latestVersion,
        releaseUrl,
        checkedAt: Date.now(),
        message: undefined,
      });

      if (available) {
        toast.info(`Tatakai ${latestVersion} is available`, {
          id: 'mobile-manual-update',
          description: Capacitor.getPlatform() === 'ios'
            ? 'Download the unsigned IPA, then sign and sideload it with your preferred tool.'
            : 'Download the latest Android package from GitHub Releases.',
          duration: Infinity,
          closeButton: true,
          action: {
            label: 'Open releases',
            onClick: () => { void openMobileReleasePage(releaseUrl); },
          },
        });
      } else if (options.announce) {
        toast.success(`Tatakai ${currentVersion} is up to date`);
      }
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const next = publish({ phase: 'error', message, checkedAt: Date.now() });
      if (options.announce) toast.error('Could not check for updates', { description: message });
      return next;
    } finally {
      checkInFlight = null;
    }
  })();

  return checkInFlight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): MobileUpdateState {
  return state;
}

export function useMobileUpdateState(): MobileUpdateState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useMobileUpdateOrchestrator(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const timer = window.setTimeout(() => {
      void checkMobileUpdate();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);
}
