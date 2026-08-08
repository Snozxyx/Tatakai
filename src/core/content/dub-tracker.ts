export type AudioPreference = 'sub' | 'dub';

export class DubTracker {
  private static STORAGE_KEY = 'tatakai_audio_preferences';

  static savePreference(animeId: string, preference: AudioPreference) {
    const preferences = this.getAllPreferences();
    preferences[animeId] = preference;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preferences));
  }

  static getPreference(animeId: string): AudioPreference | null {
    const preferences = this.getAllPreferences();
    return (preferences[animeId] as AudioPreference) || null;
  }

  private static getAllPreferences(): Record<string, string> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }
}
