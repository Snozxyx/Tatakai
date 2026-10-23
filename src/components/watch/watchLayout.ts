import { cn } from "@/lib/utils";

// One visual contract for catalogue and original-extension playback.
export const watchMainClass = (desktop: boolean) =>
  cn(
    "relative z-10 pr-4 md:pr-6 py-4 md:py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
    desktop ? "pl-4 md:pl-6" : "pl-4 md:pl-32"
  );
export const WATCH_GRID_CLASS = "flex flex-col gap-4 md:gap-6";
export const watchPlayerColumnClass = (fullWidth = false) =>
  cn("space-y-4 md:space-y-6", fullWidth ? "w-full" : "xl:col-span-9");
export const watchPlayerFrameClass = (mobile: boolean) =>
  cn(
    "rounded-xl md:rounded-2xl border border-border/30 bg-card/60",
    mobile ? "overflow-visible" : "overflow-hidden"
  );
export const WATCH_EPISODE_PANEL_CLASS =
  "p-4 md:p-5 max-h-[400px] xl:max-h-[700px] flex flex-col";
export const WATCH_EPISODE_NAV_CLASS =
  "flex-1 sm:flex-none h-10 px-3 md:px-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all text-sm";
