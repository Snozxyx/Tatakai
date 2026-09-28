import { useRef } from "react";
import { Subtitles, Upload, Type } from "lucide-react";
import { getSubtitleSelectionKey } from "@/core/player/subtitle-utils";
import type { ExternalSubtitle, CustomSubtitle, InternalSubtitleTrack, SubtitleSize, SubtitleFont, SubtitleBackground } from "../VideoPlayer.types";
import { useVideoSettings } from "@/hooks/media/useVideoSettings";

const SIZE_OPTIONS: { value: SubtitleSize; label: string }[] = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
  { value: "xlarge", label: "XL" },
];

const FONT_OPTIONS: { value: SubtitleFont; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
];

const BG_OPTIONS: { value: SubtitleBackground; label: string }[] = [
  { value: "none", label: "None" },
  { value: "semi", label: "Semi" },
  { value: "solid", label: "Solid" },
];

interface SubtitleSelectorProps {
  subtitles: ExternalSubtitle[];
  customSubtitles: CustomSubtitle[];
  internalSubtitles: InternalSubtitleTrack[];
  currentSubtitle: string;
  currentInternalSubtitleTrackId: number | null;
  subtitleBlobs: Record<string, string>;
  visibleSubtitleOptions: Array<{ sub: ExternalSubtitle; index: number }>;
  showSubtitleMenu: boolean;
  onToggleMenu: () => void;
  onSubtitleChange: (lang: string) => void;
  onInternalSubtitleChange: (trackId: number) => void;
  onCustomUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function SubtitleSelector({
  subtitles,
  customSubtitles,
  internalSubtitles,
  currentSubtitle,
  currentInternalSubtitleTrackId,
  subtitleBlobs,
  visibleSubtitleOptions,
  showSubtitleMenu,
  onToggleMenu,
  onSubtitleChange,
  onInternalSubtitleChange,
  onCustomUpload,
}: SubtitleSelectorProps) {
  const { settings, updateSetting } = useVideoSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (subtitles.length === 0 && customSubtitles.length === 0 && internalSubtitles.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={onToggleMenu}
        className={`p-2 rounded-lg hover:bg-white/10 transition-colors pointer-events-auto ${currentSubtitle !== "off" ? "text-primary" : ""}`}
        title="Subtitles"
      >
        <Subtitles className="w-4 h-4 md:w-5 md:h-5" />
      </button>

      {showSubtitleMenu && (
        <div className="absolute bottom-full right-0 mb-2 bg-background/95 backdrop-blur-md border border-border rounded-xl p-3 min-w-[180px] md:min-w-[220px] max-h-[450px] overflow-y-auto pointer-events-auto shadow-2xl">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Subtitles
          </div>
          <div className="space-y-1 mb-3">
            <button
              onClick={() => {
                onSubtitleChange("off");
              }}
              className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${currentSubtitle === "off" ? "text-primary font-medium bg-primary/10" : "text-foreground"}`}
            >
              Off
            </button>

            {internalSubtitles.length > 0 && (
              <div className="pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Internal Tracks
              </div>
            )}

            {internalSubtitles.map((sub) => {
              const isSelected = currentInternalSubtitleTrackId === sub.id;
              return (
                <button
                  key={sub.id}
                  onClick={() => onInternalSubtitleChange(sub.id)}
                  className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${isSelected ? "text-primary font-medium bg-primary/10" : "text-foreground"}`}
                >
                  <span className="truncate block max-w-[150px]">{sub.label || sub.lang}</span>
                </button>
              );
            })}

            {visibleSubtitleOptions.map(({ sub, index }) => {
              const subtitleSelectionKey = getSubtitleSelectionKey(sub, index);
              const isSelected = currentSubtitle === subtitleSelectionKey;
              return (
                <button
                  key={subtitleSelectionKey}
                  onClick={() => onSubtitleChange(subtitleSelectionKey)}
                  className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${isSelected ? "text-primary font-medium bg-primary/10" : "text-foreground"}`}
                >
                  <span className="truncate block max-w-[150px]">{sub.label || sub.lang}</span>
                </button>
              );
            })}
          </div>

          <div className="h-px bg-border my-2" />

          {/* Subtitle Style Options */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              <Type className="w-3 h-3" />
              <span>Style Settings</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">Size</span>
                <div className="flex gap-1">
                  {SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateSetting("subtitleSize", opt.value)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${settings.subtitleSize === opt.value ? "bg-primary border-primary text-primary-foreground" : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">Font</span>
                <div className="flex gap-1">
                  {FONT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateSetting("subtitleFont", opt.value)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${settings.subtitleFont === opt.value ? "bg-primary border-primary text-primary-foreground" : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">BG</span>
                <div className="flex gap-1">
                  {BG_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateSetting("subtitleBackground", opt.value)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${settings.subtitleBackground === opt.value ? "bg-primary border-primary text-primary-foreground" : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-border my-2" />

          <label className="w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors text-foreground flex items-center gap-2 cursor-pointer group">
            <Upload className="w-3 h-3 group-hover:text-primary transition-colors" />
            <span>Add Custom</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".vtt,.srt"
              className="hidden"
              onChange={onCustomUpload}
            />
          </label>
        </div>
      )}
    </div>
  );
}
