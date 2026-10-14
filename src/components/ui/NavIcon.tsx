import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface NavIconProps {
  icon: LucideIcon;
  active?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
  label?: string;
  /**
   * Render the label inline beside the icon (for a rail that hover-expands)
   * instead of as an absolute hover tooltip. The parent controls the flag.
   */
  expanded?: boolean;
}

export function NavIcon({ icon: Icon, active, onClick, label, expanded = false }: NavIconProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "nav-icon group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        expanded && "flex w-full items-center gap-3.5 !justify-start",
        active ? "nav-icon-active" : "nav-icon-inactive"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label &&
        (expanded ? (
          <span className="truncate text-sm font-semibold">{label}</span>
        ) : (
          <span className="pointer-events-none absolute left-full ml-4 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-card-foreground opacity-0 shadow-md transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100">
            {label}
          </span>
        ))}
    </button>
  );
}
