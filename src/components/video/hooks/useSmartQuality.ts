import { useState, useEffect, useRef, useCallback } from "react";
import type { QualityPreset } from "../VideoPlayer.types";

const QUALITY_RANK: QualityPreset[] = ["1080p", "720p", "480p", "360p"];

function downgradeQuality(current: QualityPreset): QualityPreset | null {
  const idx = QUALITY_RANK.indexOf(current);
  if (idx < 0 || idx >= QUALITY_RANK.length - 1) return null;
  return QUALITY_RANK[idx + 1];
}

function upgradeQuality(current: QualityPreset): QualityPreset | null {
  const idx = QUALITY_RANK.indexOf(current);
  if (idx <= 0) return null;
  return QUALITY_RANK[idx - 1];
}

interface UseSmartQualityParams {
  enabled: boolean;
  currentQuality: QualityPreset;
  isBuffering: boolean;
  bufferingCount: number;
  onQualityChange: (quality: QualityPreset) => void;
}

export function useSmartQuality({
  enabled,
  currentQuality,
  isBuffering,
  bufferingCount,
  onQualityChange,
}: UseSmartQualityParams) {
  const stableBufferRef = useRef(0);
  const lastDowngradeRef = useRef(0);
  const originalQualityRef = useRef<QualityPreset>(currentQuality);

  // Track stable playback periods
  useEffect(() => {
    if (!isBuffering) {
      stableBufferRef.current += 1;

      // After 30 seconds of stable playback (30 ticks at 1s interval), try to upgrade
      if (stableBufferRef.current >= 30 && enabled) {
        const upgraded = upgradeQuality(currentQuality);
        if (upgraded && currentQuality !== originalQualityRef.current) {
          onQualityChange(upgraded);
          stableBufferRef.current = 0;
        }
      }
    } else {
      stableBufferRef.current = 0;
    }
  }, [isBuffering, currentQuality, enabled, onQualityChange]);

  // Downgrade on repeated buffering
  useEffect(() => {
    if (!enabled) return;
    if (bufferingCount >= 3 && Date.now() - lastDowngradeRef.current > 30000) {
      const downgraded = downgradeQuality(currentQuality);
      if (downgraded) {
        originalQualityRef.current = currentQuality;
        onQualityChange(downgraded);
        lastDowngradeRef.current = Date.now();
        stableBufferRef.current = 0;
      }
    }
  }, [bufferingCount, currentQuality, enabled, onQualityChange]);

  return {
    originalQuality: originalQualityRef.current,
  };
}
