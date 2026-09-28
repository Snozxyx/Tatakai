import { useMemo } from "react";
import type { VideoSettings } from "@/hooks/media/useVideoSettings";
import { buildSubtitleCueStyle } from "@/lib/video/subtitleStyle";

interface SubtitleOverlayProps {
  lines: string[];
  settings: VideoSettings;
  /** Extra bottom offset (px) so subtitles clear the controls bar when shown. */
  controlsVisible: boolean;
}

/**
 * Custom subtitle renderer. Draws the active cue lines above everything
 * (including the Anime4K canvas), fully styled from user settings — the native
 * `::cue` pseudo-element can't do per-user color/opacity/outline/position, so we
 * paint it ourselves. The source tracks run in "hidden" mode so the browser
 * still parses cues but doesn't double-render them.
 */
export function SubtitleOverlay({ lines, settings, controlsVisible }: SubtitleOverlayProps) {
  const cueStyle = useMemo<React.CSSProperties>(() => buildSubtitleCueStyle(settings), [settings]);

  if (!lines.length) return null;

  // subtitlePosition (0..40) lifts subtitles off the bottom. Add clearance for
  // the controls bar when it's visible so text never sits under the scrubber.
  const bottomPx = 40 + settings.subtitlePosition * 6 + (controlsVisible ? 56 : 0);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 flex flex-col items-center gap-1 px-4 text-center transition-[bottom] duration-200"
      style={{ bottom: `${bottomPx}px` }}
      aria-live="polite"
    >
      {lines.map((line, idx) => (
        <span key={`${idx}-${line}`} style={cueStyle}>
          {line}
        </span>
      ))}
    </div>
  );
}
