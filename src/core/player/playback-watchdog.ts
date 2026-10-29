/** Track decoded playback progress, rather than successful network requests. */
export function createPlaybackWatchdog({
  video, recover, onProgress, startupTimeoutMs = 15_000, stallTimeoutMs = 6_000,
  now = () => performance.now(),
}: {
  video: HTMLVideoElement;
  recover: () => void;
  onProgress: () => void;
  startupTimeoutMs?: number;
  stallTimeoutMs?: number;
  now?: () => number;
}) {
  let lastProgress = now();
  let lastTime = video.currentTime;
  let seeking = video.seeking;
  let started = false;
  return {
    reset() {
      lastProgress = now();
      lastTime = video.currentTime;
      seeking = video.seeking;
      started = false;
    },
    tick() {
      const time = now();
      // A seek can paint a new still frame without resuming playback. It must
      // not count as progress or disable the timeout indefinitely.
      const advancing = !video.paused && !video.seeking && !seeking &&
        video.currentTime > lastTime && video.currentTime - lastTime < 5;
      lastTime = video.currentTime;
      seeking = video.seeking;
      if (advancing) {
        started = true;
        lastProgress = time;
        onProgress();
        return;
      }
      if (video.ended || (video.paused && video.readyState >= 2 && !video.seeking)) {
        lastProgress = time;
        return;
      }
      if (time - lastProgress >= (started ? stallTimeoutMs : startupTimeoutMs)) {
        lastProgress = time;
        recover();
      }
    },
  };
}
