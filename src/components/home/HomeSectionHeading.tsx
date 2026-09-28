import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one heading used by every home-page content rail.
 *
 * Home sections used to each roll their own header (bold vs semibold, boxed
 * gradient icons, eyebrows, Japanese titles) which made the page read as a
 * stack of unrelated widgets. This mirrors the "Trending Now" style — an
 * accent lucide icon next to a `font-display` semibold title, with an optional
 * right-aligned action (usually a "View All" link) — so every rail lines up.
 */
interface HomeSectionHeadingProps {
  /** Accent icon, e.g. `<Flame className="w-5 h-5 text-orange" />`. Sized by the caller. */
  icon?: ReactNode;
  title: ReactNode;
  /** Optional supporting line under the title. */
  subtitle?: ReactNode;
  as?: "h2" | "h3";
  /** Sub-rails inside a section use "sub" for a slightly smaller title. */
  size?: "default" | "sub";
  /** Right-aligned control. Overrides the `viewAllTo` shortcut when provided. */
  action?: ReactNode;
  /** Renders a standard "View All →" link to this route. */
  viewAllTo?: string;
  viewAllLabel?: string;
  className?: string;
}

export function HomeSectionHeading({
  icon,
  title,
  subtitle,
  as: Heading = "h2",
  size = "default",
  action,
  viewAllTo,
  viewAllLabel = "View All",
  className,
}: HomeSectionHeadingProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-2", size === "sub" ? "mb-4" : "mb-6", className)}>
      <div className="min-w-0">
        <Heading
          className={cn(
            "font-display font-semibold tracking-tight flex items-center gap-2",
            size === "sub" ? "text-lg" : "text-2xl",
          )}
        >
          {icon}
          {title}
        </Heading>
        {subtitle && (
          <p className="mt-0.5 text-xs md:text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {action ??
        (viewAllTo && (
          <Link
            to={viewAllTo}
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground shrink-0"
          >
            {viewAllLabel}
            <ArrowRight className="w-4 h-4" />
          </Link>
        ))}
    </div>
  );
}
