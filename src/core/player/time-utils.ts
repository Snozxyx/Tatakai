/**
 * Shared time formatting for player UI.
 * Intentionally kept dependency-free so it can be reused by both web + mobile players.
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

