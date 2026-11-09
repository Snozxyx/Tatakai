import type { ContentSafetySettings } from '@/hooks/user/useContentSafetySettings';

/** Keep an explicit choice through route remounts while profile data is catching up. */
export class AccountContentSafetyState {
  private accounts = new Map<string, { profile: string; value: ContentSafetySettings; revision: number; pending: number | null }>();

  read(userId: string, profile: ContentSafetySettings): ContentSafetySettings {
    const signature = JSON.stringify(profile);
    let entry = this.accounts.get(userId);
    if (!entry) {
      entry = { profile: signature, value: profile, revision: 0, pending: null };
      this.accounts.set(userId, entry);
    } else if (entry.profile !== signature) {
      entry.profile = signature;
      if (entry.pending === null) entry.value = profile;
    }
    return entry.value;
  }

  choose(userId: string, profile: ContentSafetySettings, value: ContentSafetySettings): number {
    this.read(userId, profile);
    const entry = this.accounts.get(userId)!;
    entry.value = value;
    entry.pending = ++entry.revision;
    return entry.revision;
  }

  settled(userId: string, revision: number) {
    const entry = this.accounts.get(userId);
    if (entry?.pending === revision) entry.pending = null;
  }
}
