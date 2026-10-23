const key = 'tatakai-notification-sound';
let context: AudioContext | undefined;
let lastPlayed = 0;
export function notificationSoundEnabled() {
  try { return localStorage.getItem(key) === 'true'; } catch { return false; }
}
export function setNotificationSound(enabled: boolean) {
  localStorage.setItem(key, String(enabled));
  window.dispatchEvent(new Event('notification-sound-change'));
  if (enabled) {
    try {
      context ??= new AudioContext();
      void context.resume().catch(() => {});
    } catch { /* Preference still applies to native notifications. */ }
  }
}
export function playNotificationSound() {
  if (!notificationSoundEnabled() || Date.now() - lastPlayed < 1000) return;
  lastPlayed = Date.now();
  try {
    context ??= new AudioContext();
    if (context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(520, context.currentTime + 0.15);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
  } catch { /* Audio may be unavailable or blocked until a user gesture. */ }
}

// Re-enable the saved preference after the first gesture on a new page load.
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (!notificationSoundEnabled()) return;
    try {
      context ??= new AudioContext();
      void context.resume().catch(() => {});
    } catch { /* No Web Audio support. */ }
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
