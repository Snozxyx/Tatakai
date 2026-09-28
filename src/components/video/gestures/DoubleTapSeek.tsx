import { useState, useCallback, useRef, useEffect } from "react";

interface DoubleTapSeekProps {
  onSeek: (direction: "forward" | "backward") => void;
  children: React.ReactNode;
}

export function DoubleTapSeek({ onSeek, children }: DoubleTapSeekProps) {
  const [ripple, setRipple] = useState<{ side: "left" | "right"; x: number; y: number; id: number } | null>(null);
  const lastTapRef = useRef<{ time: number; side: "left" | "right" } | null>(null);
  const rippleIdRef = useRef(0);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const width = rect.width;
      const side: "left" | "right" = x < width / 3 ? "left" : x > (width * 2) / 3 ? "right" : "center";

      if (side === "center") return;

      const now = Date.now();
      const lastTap = lastTapRef.current;

      if (lastTap && lastTap.side === side && now - lastTap.time < 300) {
        // Double tap detected
        onSeek(side === "left" ? "backward" : "forward");
        rippleIdRef.current += 1;
        setRipple({ side, x: touch.clientX - rect.left, y: touch.clientY - rect.top, id: rippleIdRef.current });
        setTimeout(() => setRipple(null), 600);
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { time: now, side };
      }
    },
    [onSeek],
  );

  return (
    <div className="relative w-full h-full" onTouchEnd={handleTouchEnd}>
      {children}
      {ripple && (
        <div
          key={ripple.id}
          className={`absolute top-0 bottom-0 w-1/3 pointer-events-none ${ripple.side === "left" ? "left-0" : "right-0"}`}
        >
          <div
            className="absolute rounded-full bg-white/20 animate-ping"
            style={{
              left: ripple.side === "left" ? ripple.x - 30 : undefined,
              right: ripple.side === "right" ? (ripple as any).parentElement?.offsetWidth - ripple.x - 30 : undefined,
              top: ripple.y - 30,
              width: 60,
              height: 60,
            }}
          />
          <div
            className="absolute flex items-center justify-center text-white font-bold text-lg"
            style={{
              left: ripple.side === "left" ? "50%" : undefined,
              right: ripple.side === "right" ? "50%" : undefined,
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            {ripple.side === "left" ? "−10s" : "+10s"}
          </div>
        </div>
      )}
    </div>
  );
}
