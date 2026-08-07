interface SubtitlePreference {
  animeId: string;
  language: string;
}

export class SubtitleMemory {
  private static STORAGE_KEY = 'tatakai_subtitle_memory';

  static savePreference(animeId: string, language: string) {
    const preferences = this.getAllPreferences();
    preferences[animeId] = language;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preferences));
  }

  static getPreference(animeId: string): string | null {
    const preferences = this.getAllPreferences();
    return preferences[animeId] || null;
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
