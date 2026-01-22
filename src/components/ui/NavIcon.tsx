import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface NavIconProps {
  icon: LucideIcon;
  active?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
  label?: string;
}

export function NavIcon({ icon: Icon, active, onClick, label }: NavIconProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "nav-icon group relative",
        active ? "nav-icon-active" : "nav-icon-inactive"
      )}
    >
      <Icon className="w-5 h-5" />
      {label && (
        <span className="absolute left-full ml-4 px-3 py-1.5 rounded-lg bg-card border border-border text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {label}
        </span>
      )}
    </button>
  );
}
