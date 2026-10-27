import type { ReactNode } from "react";
import { Pause, Play, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import uiI18n from "@/lib/uiI18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ReaderPanel } from "@/components/settings/panels/ReaderPanel";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { ReaderSettings } from "@/hooks/media/useReaderSettings";

export function ReaderToolButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick(): void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "ui-button flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border backdrop-blur transition-colors duration-150 motion-safe:active:scale-[0.98]",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card/95 text-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
export function ReaderTopbar({ children }: { children: ReactNode }) {
  return (
    <div className="reader-topbar sticky top-0 z-40 flex items-center gap-1.5 border-b border-border bg-background/95 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur sm:gap-2 sm:px-3">
      {children}
    </div>
  );
}
export function ReaderToolbar({
  visible = true,
  children,
}: {
  visible?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "reader-tools fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur-xl transition-opacity duration-200 sm:bottom-auto sm:left-auto sm:right-3 sm:top-1/2 sm:-translate-x-0 sm:-translate-y-1/2 sm:flex-col sm:gap-2",
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      {children}
    </div>
  );
}
export function ReaderSettingsSheet({
  open,
  onOpenChange,
  compact,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  compact: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={compact ? "bottom" : "right"}
        className="flex flex-col gap-0 overflow-hidden border-border bg-background/95 p-0 backdrop-blur-xl md:w-[400px] md:max-w-[400px] max-md:inset-x-2 max-md:bottom-2 max-md:top-auto max-md:h-auto max-md:max-h-[85dvh] max-md:w-auto max-md:rounded-3xl max-md:border max-md:shadow-2xl"
      >
        <div className="shrink-0 pt-2.5 md:hidden" aria-hidden>
          <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/40" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
          <SheetHeader>
            <SheetTitle>{uiI18n.t("app.reader_settings_bf922fa5")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ReaderPanel />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ReaderNavigationSheet({
  open,
  onOpenChange,
  page,
  total,
  onPage,
  settings,
  updateSetting,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  page: number;
  total: number;
  onPage(page: number): void;
  settings: ReaderSettings;
  updateSetting: <K extends keyof ReaderSettings>(
    key: K,
    value: ReaderSettings[K]
  ) => void;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[82dvh] flex-col overflow-hidden rounded-t-3xl border-border bg-background/95 px-0 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:mx-auto sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 px-5 pr-14 text-left">
          <SheetTitle>{uiI18n.t("app.reader_navigation_911835f9")}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 scrollbar-thin">
          <section className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between text-sm font-medium">
              <label htmlFor="reader-page-seek">
                {uiI18n.t("app.page_fb06270f")}
              </label>
              <span className="tabular-nums">
                {Math.min(page + 1, total)} / {total}
              </span>
            </div>
            <input
              id="reader-page-seek"
              aria-label={uiI18n.t("app.jump_to_page_8a8ded94")}
              type="range"
              min={0}
              max={Math.max(0, total - 1)}
              value={page}
              disabled={!total}
              onChange={(event) => onPage(Number(event.target.value))}
              className="h-8 w-full accent-primary"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">{uiI18n.t("app.zoom_9b3cbed5")}</span>
              <div className="flex items-center gap-2">
                <ReaderToolButton
                  label={uiI18n.t("app.zoom_out_a4ae4b24")}
                  onClick={() =>
                    updateSetting("zoom", Math.max(50, settings.zoom - 10))
                  }
                >
                  <ZoomOut className="size-5" />
                </ReaderToolButton>
                <button
                  onClick={() => updateSetting("zoom", 100)}
                  aria-label={uiI18n.t("app.reset_reader_zoom_85463402")}
                  className="min-h-11 min-w-14 rounded-lg border border-border px-2 text-sm tabular-nums hover:bg-muted"
                >
                  {settings.zoom}%
                </button>
                <ReaderToolButton
                  label={uiI18n.t("app.zoom_in_4fc05f27")}
                  onClick={() =>
                    updateSetting("zoom", Math.min(300, settings.zoom + 10))
                  }
                >
                  <ZoomIn className="size-5" />
                </ReaderToolButton>
              </div>
            </div>
            <div
              className="flex gap-2"
              role="group"
              aria-label={uiI18n.t("app.reading_mode_d75871a6")}
            >
              {(["vertical", "paged"] as const).map((mode) => (
                <button
                  key={mode}
                  aria-pressed={settings.readingMode === mode}
                  onClick={() => updateSetting("readingMode", mode)}
                  className={cn(
                    "min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium",
                    settings.readingMode === mode
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {mode === "vertical"
                    ? uiI18n.t("app.webtoon_scroll_e517e75b")
                    : uiI18n.t("app.page_by_page_3fe49ff6")}
                </button>
              ))}
            </div>
            {settings.readingMode === "vertical" && (
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() =>
                    updateSetting("autoScroll", !settings.autoScroll)
                  }
                  aria-pressed={settings.autoScroll}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                >
                  {settings.autoScroll ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {settings.autoScroll
                    ? uiI18n.t("app.pause_auto_scroll_8039aadb")
                    : uiI18n.t("app.auto_scroll_a03e7fab")}
                </button>
                <label className="flex items-center gap-2 text-sm">
                  {uiI18n.t("app.speed_2d2cb022")}
                  <ThemedSelect
                    aria-label={uiI18n.t("app.auto_scroll_speed_1b63a4e6")}
                    value={settings.autoScrollSpeed}
                    onChange={(event) =>
                      updateSetting(
                        "autoScrollSpeed",
                        Number(event.target.value)
                      )
                    }
                    className="min-h-11 rounded-lg border border-border bg-background px-2"
                  >
                    {[1, 2, 4, 6, 8, 10].map((speed) => (
                      <option key={speed} value={speed}>
                        {speed}
                      </option>
                    ))}
                  </ThemedSelect>
                </label>
              </div>
            )}
          </section>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
