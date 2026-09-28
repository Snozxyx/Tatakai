import { useState, useCallback, useRef, useEffect } from "react";

interface SwipeGesturesProps {
  onSwipeUp?: (delta: number) => void;
  onSwipeDown?: (delta: number) => void;
  onSwipeLeft?: (delta: number) => void;
  onSwipeRight?: (delta: number) => void;
  children: React.ReactNode;
}

export function SwipeGestures({
  onSwipeUp,
  onSwipeDown,
  onSwipeLeft,
  onSwipeRight,
  children,
}: SwipeGesturesProps) {
  const [gestureType, setGestureType] = useState<"brightness" | "volume" | "seek" | null>(null);
  const [gestureValue, setGestureValue] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const gestureRef = useRef<"vertical" | "horizontal" | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    gestureRef.current = null;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      // Determine gesture type on first significant movement
      if (!gestureRef.current) {
        if (Math.abs(deltaX) > 15 || Math.abs(deltaY) > 15) {
          gestureRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
          setGestureType(gestureRef.current === "vertical" ? "brightness" : "seek");
        }
        return;
      }

      if (gestureRef.current === "vertical") {
        const rectHeight = rect.height;
        const deltaPercent = -(deltaY / rectHeight) * 100;
        setGestureValue(Math.max(-100, Math.min(100, deltaPercent)));

        const isLeftSide = touchStartRef.current.x < rect.width / 2;
        setGestureType(isLeftSide ? "brightness" : "volume");
      } else {
        const rectWidth = rect.width;
        const deltaPercent = (deltaX / rectWidth) * 100;
        setGestureValue(Math.max(-100, Math.min(100, deltaPercent)));
        setGestureType("seek");
      }
    },
    [],
  );

  const handleTouchEnd = useCallback(() => {
    if (gestureRef.current && touchStartRef.current) {
      if (gestureRef.current === "vertical") {
        const normalizedDelta = gestureValue / 100;
        if (gestureType === "brightness") {
          onSwipeUp?.(normalizedDelta);
        } else if (gestureType === "volume") {
          onSwipeDown?.(normalizedDelta);
        }
      } else {
        const normalizedDelta = gestureValue / 100;
        if (gestureValue > 0) {
          onSwipeRight?.(normalizedDelta);
        } else {
          onSwipeLeft?.(normalizedDelta);
        }
      }
    }

    touchStartRef.current = null;
    gestureRef.current = null;
    setGestureType(null);
    setGestureValue(0);
  }, [gestureType, gestureValue, onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight]);

  return (
    <div
      className="relative w-full h-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
      {gestureType && (
        <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
          <div className="bg-black/70 backdrop-blur-sm rounded-xl px-6 py-3 text-white text-sm font-bold flex flex-col items-center gap-1">
            {gestureType === "brightness" && (
              <>
                <span className="text-xs text-white/60">Brightness</span>
                <span className="text-2xl">{Math.round(50 + gestureValue * 0.5)}%</span>
              </>
            )}
            {gestureType === "volume" && (
              <>
                <span className="text-xs text-white/60">Volume</span>
                <span className="text-2xl">{Math.round(50 + gestureValue * 0.5)}%</span>
              </>
            )}
            {gestureType === "seek" && (
              <>
                <span className="text-xs text-white/60">Seek</span>
                <span className="text-2xl">{gestureValue > 0 ? "+" : ""}{Math.round(gestureValue * 10)}s</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
