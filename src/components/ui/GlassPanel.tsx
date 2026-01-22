import { cn } from "@/lib/utils";
import { ReactNode, HTMLAttributes, forwardRef } from "react";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ children, className, hoverEffect = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "glass-panel",
          hoverEffect && "glass-panel-hover",
          className
        )}
        {...props}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none" />
        {children}
      </div>
    );
  }
);

GlassPanel.displayName = "GlassPanel";
