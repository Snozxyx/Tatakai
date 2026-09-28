import { useState, useCallback, useRef, useEffect } from "react";

interface LongPressSpeedProps {
  onLongPressStart: () => void;
  onLongPressEnd: () => void;
  children: React.ReactNode;
}

export function LongPressSpeed({ onLongPressStart, onLongPressEnd, children }: LongPressSpeedProps) {
  const [isActive, setIsActive] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isLongPressRef.current = false;

      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        setIsActive(true);
        onLongPressStart();
      }, 500);
    },
    [onLongPressStart],
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isLongPressRef.current) {
      setIsActive(false);
      onLongPressEnd();
      isLongPressRef.current = false;
    }
  }, [onLongPressEnd]);

  const handleTouchMove = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className="relative w-full h-full"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      {children}
      {isActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="bg-primary/90 backdrop-blur-sm rounded-full px-4 py-1.5 text-white text-xs font-bold shadow-lg animate-pulse">
            2x Speed
          </div>
        </div>
      )}
    </div>
  );
}
