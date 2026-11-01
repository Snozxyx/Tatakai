import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** One page marker and one layout box, regardless of loading/enhancement state. */
export const ReaderImageSlot = forwardRef<
  HTMLDivElement,
  {
    pageNumber: number;
    style: CSSProperties;
    pending: boolean;
    children: ReactNode;
  }
>(function ReaderImageSlot({ pageNumber, style, pending, children }, ref) {
  return (
    <div
      ref={ref}
      data-page={pageNumber}
      className="relative mx-auto"
      style={style}
    >
      {pending && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/[0.03]"
          aria-hidden="true"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
        </div>
      )}
      {children}
    </div>
  );
});
