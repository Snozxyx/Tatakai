import type { LucideIcon } from "lucide-react";
import { Search, SearchX, X } from "lucide-react";
import { type ReactNode, useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the settings screens, styled after Discord's
 * settings pane: flat content instead of nested glass cards, a plain gray
 * section label + heading per group, and rows separated by whitespace rather
 * than hairline rules or per-row boxes. The shell (SettingsModal) already
 * renders the page title, so each SettingsSection is a Discord-style sub-group
 * within it.
 */

/** Ids a row hands its control, so a screen reader reads the label not the widget. */
export type SettingRowIds = { labelId: string; descriptionId?: string };

/** A control is either a node, or a function that wants the row's aria ids. */
type ControlSlot = ReactNode | ((ids: SettingRowIds) => ReactNode);

/**
 * Badge tones, all from theme tokens. `warning` is `--amber` and `success` is
 * `--success`; both are fixed in `:root` rather than per-theme, so a status pill
 * keeps meaning the same thing when the palette around it changes.
 */
const TONE_CLASSES = {
  primary: "bg-primary/15 text-primary border-primary/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-amber/15 text-amber border-amber/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground border-white/10",
} as const;

export type SettingsTone = keyof typeof TONE_CLASSES;

export function SettingsBadge({
  tone = "muted",
  className,
  children,
}: {
  tone?: SettingsTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[10px] font-black uppercase tracking-wider leading-4 whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
/**
 * A settings sub-group: a plain gray section label, optional description and a
 * right-hand action, then the body. Flat — no card, no kicker, no rule. Stacked
 * sections are separated by the panel's own vertical spacing (e.g. space-y-6)
 * so a panel reads as one continuous Discord-style page rather than a tower of
 * boxes. `icon`/`eyebrow` are accepted for source compatibility but the flat
 * layout omits them.
 */
export function SettingsSection({
  title,
  description,
  action,
  id,
  className,
  bodyClassName,
  children,
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Forwarded to the section root so a deep-link can scroll to it by id. */
  id?: string;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
          {description && (
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground/60">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className={cn("mt-3", bodyClassName)}>{children}</div>}
    </section>
  );
}
/**
 * One setting: label, description, optional badge/icon, and a control on the
 * right. A flat Discord-style row — no card, no divider — separated from its
 * siblings by vertical breathing room. `children` expands the row for nested
 * controls that unfold below (a confirm step, a revealed field).
 *
 * Pass `control` as a function to get the row's aria ids. Radix switches and
 * select triggers are buttons with no accessible name of their own, so without
 * `aria-labelledby` a screen reader announces identically anonymous toggles.
 */
export function SettingRow({
  title,
  description,
  badge,
  icon: Icon,
  control,
  tone = "default",
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  icon?: LucideIcon;
  control?: ControlSlot;
  /** `accent` marks the row with a primary edge — for the one setting a tab pushes. */
  tone?: "default" | "accent";
  className?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div
      className={cn(
        "py-3.5",
        tone === "accent" && "border-l-2 border-l-primary pl-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <p id={labelId} className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
            {title}
            {badge}
          </p>
          {description && (
            <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {control && (
          <div className="shrink-0">
            {typeof control === "function" ? control({ labelId, descriptionId }) : control}
          </div>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
/** Controlled search box with a leading icon and a clear affordance. */
export function SettingsSearch({
  value,
  onChange,
  placeholder = "Search settings",
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-9 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-9 text-sm",
          "placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Centered placeholder for empty / no-match / signed-out states. Flat, not a card. */
export function SettingsEmptyState({
  icon: Icon = SearchX,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
