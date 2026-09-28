interface SecondarySubtitleOverlayProps {
  text: string;
}

export function SecondarySubtitleOverlay({ text }: SecondarySubtitleOverlayProps) {
  if (!text) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 md:bottom-32 px-6 z-20 flex justify-center">
      <div className="max-w-[92%] text-center text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-pre-line text-base md:text-lg font-semibold">
        {text}
      </div>
    </div>
  );
}
