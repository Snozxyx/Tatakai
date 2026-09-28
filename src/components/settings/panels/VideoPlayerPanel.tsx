import { VideoSettingsPanel } from '@/components/video/VideoSettingsPanel';

/** Video Player: reuses the embedded video settings panel verbatim. */
export function VideoPlayerPanel() {
  return <VideoSettingsPanel isOpen={true} onClose={() => { }} embedded />;
}
