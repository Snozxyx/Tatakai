import { useEffect, useState } from "react";
import { safeProfileAudio } from "@/lib/profileThemeMusic";
import type { ThemeEditorProps } from "../types";
import { defaultMidnightLofiConfig, readMidnightLofiConfig } from "./config";
export default function MidnightLofiEditor({
  configuration,
  onChange,
}: ThemeEditorProps) {
  const c =
    readMidnightLofiConfig(configuration) ?? defaultMidnightLofiConfig();
  const [audioUrl, setAudioUrl] = useState(c.music.url);
  const [urlError, setUrlError] = useState("");
  useEffect(() => setAudioUrl(c.music.url), [c.music.url]);
  return (
    <div className="space-y-5 p-5">
      <h4 className="text-lg font-semibold">Your midnight soundtrack</h4>
      <p className="text-sm text-muted-foreground">
        Leave the link empty for the original Tatakai lo-fi loop. Music starts
        when your visitor presses play.
      </p>
      <label className="grid gap-2 text-sm">
        Audio URL (HTTPS MP3, OGG, or WAV)
        <input
          className="rounded-lg border bg-background p-3"
          type="url"
          value={audioUrl}
          placeholder="https://example.com/music.mp3"
          onChange={(e) => {
            setAudioUrl(e.target.value);
            setUrlError("");
          }}
          onBlur={() => {
            const url = safeProfileAudio(audioUrl);
            if (audioUrl.trim() && !url) {
              setUrlError(
                "Use a complete HTTPS audio URL without a username or password."
              );
              return;
            }
            onChange({ ...c, music: { ...c.music, url } });
          }}
          aria-invalid={!!urlError}
        />
      </label>
      {urlError && (
        <p role="alert" className="text-sm text-destructive">
          {urlError}
        </p>
      )}
      <label className="grid gap-2 text-sm">
        Track title
        <input
          className="rounded-lg border bg-background p-3"
          maxLength={100}
          value={c.music.title}
          onChange={(e) =>
            onChange({ ...c, music: { ...c.music, title: e.target.value } })
          }
        />
      </label>
      <label className="grid gap-2 text-sm">
        Default volume
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={c.music.volume}
          onChange={(e) =>
            onChange({
              ...c,
              music: { ...c.music, volume: Number(e.target.value) },
            })
          }
        />
      </label>
      <label className="grid gap-2 text-sm">
        Accent
        <select
          className="rounded-lg border bg-background p-3"
          value={c.accent}
          onChange={(e) => onChange({ ...c, accent: e.target.value })}
        >
          <option value="cyan">Moon blue</option>
          <option value="amber">Lamplight</option>
          <option value="violet">Wisteria</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm">
        Atmosphere intensity
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={c.glowIntensity}
          onChange={(e) =>
            onChange({ ...c, glowIntensity: Number(e.target.value) })
          }
        />
      </label>
      {(["motion", "scanlines", "japaneseAccents"] as const).map((key) => (
        <label key={key} className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={c[key]}
            onChange={(e) => onChange({ ...c, [key]: e.target.checked })}
          />
          {key === "motion"
            ? "Gentle scene motion"
            : key === "scanlines"
            ? "Film texture"
            : "Japanese lettering"}
        </label>
      ))}
    </div>
  );
}
