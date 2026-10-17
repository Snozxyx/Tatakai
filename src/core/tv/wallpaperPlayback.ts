/** Keep decorative decoding out of playback, readers and background activity. */
export function shouldAnimateWallpaper(state: {
  enabled: boolean; reduced: boolean; visible: boolean;
  foreground: boolean; paused: boolean; previewing: boolean;
}) {
  return state.enabled && !state.reduced && state.visible && state.foreground && !state.paused && !state.previewing;
}
