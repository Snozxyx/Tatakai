import { isTV } from "@/core/tv/device";
import { useEffect } from "react";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { normalizeKeyToken, resolveAction } from "@/lib/video/keybindings";
import type { UseVideoKeyboardParams } from "../VideoPlayer.types";

export function useVideoKeyboard({
  isMobile,
  timelineSeekingLocked,
  keybinds,
  togglePlay,
  toggleFullscreen,
  toggleMute,
  togglePiP,
  skip,
  changeVolume,
  onPrevEpisode,
  onNextEpisode,
}: UseVideoKeyboardParams) {
  useEffect(() => {
    if (isMobile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // The TV focus controller owns D-Pad and Select on visible controls.
      if (isTV() && document.activeElement?.closest('button,a,[data-tv-modal]')) return;
      const activeTag = document.activeElement?.tagName;
      if (e.defaultPrevented || document.activeElement?.closest('[role="dialog"], [contenteditable="true"], select, button, a, [role="slider"]') || activeTag === "INPUT" || activeTag === "TEXTAREA") return;
      // Don't hijack keys while a modifier is held (browser/OS shortcuts).
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const token = normalizeKeyToken(e);
      const action = resolveAction(keybinds, token);

      // Volume arrows stay hardcoded — they are not user-remappable and would
      // otherwise collide with the default seek bindings if someone remaps them.
      if (!action) {
        if (token === "arrowup") {
          e.preventDefault();
          changeVolume(0.1);
        } else if (token === "arrowdown") {
          e.preventDefault();
          changeVolume(-0.1);
        }
        return;
      }

      const guardSeek = () => {
        if (timelineSeekingLocked) {
          toast.info(i18n.t('player.seekingLocked'), { id: "torrent-timeline-locked" });
          return false;
        }
        return true;
      };

      switch (action) {
        case "playPause":
          e.preventDefault();
          togglePlay();
          break;
        case "fullscreen":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "mute":
          e.preventDefault();
          toggleMute();
          break;
        case "pip":
          e.preventDefault();
          togglePiP();
          break;
        case "seekBack":
          e.preventDefault();
          if (guardSeek()) skip(-10);
          break;
        case "seekForward":
          e.preventDefault();
          if (guardSeek()) skip(10);
          break;
        case "prevEpisode":
          e.preventDefault();
          onPrevEpisode?.();
          break;
        case "nextEpisode":
          e.preventDefault();
          onNextEpisode?.();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isMobile,
    keybinds,
    togglePlay,
    toggleFullscreen,
    toggleMute,
    togglePiP,
    skip,
    changeVolume,
    timelineSeekingLocked,
    onPrevEpisode,
    onNextEpisode,
  ]);
}
