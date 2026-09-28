import { useCallback, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { fetchViaChain } from "@/core/network/proxyChain";
import {
  buildSubtitleFetchCandidates,
  getSubtitleSelectionKey,
  isBrowserReadyVttUrl,
  normalizeSubtitleToVtt,
  parseVttCues,
} from "@/core/player/subtitle-utils";
import { getProxiedSubtitleUrl } from "@/lib/api";
import type {
  UseSubtitleManagerParams,
  ExternalSubtitle,
  CustomSubtitle,
  InternalSubtitleTrack,
} from "../VideoPlayer.types";

// ---------------------------------------------------------------------------
// Language normalization helpers (extracted from VideoPlayer.tsx)
// ---------------------------------------------------------------------------

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: "English",
  ja: "Japanese",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ar: "Arabic",
  hi: "Hindi",
  it: "Italian",
  ru: "Russian",
  ko: "Korean",
  zh: "Chinese",
  und: "Unknown",
};

export function normalizeTrackLanguage(lang?: string): string {
  const value = String(lang || "").trim().toLowerCase().replace("_", "-");
  if (!value) return "und";
  if (value === "en" || value.startsWith("eng") || value.includes("english")) return "en";
  if (value === "ja" || value.startsWith("jpn") || value.includes("japanese")) return "ja";
  if (value === "es" || value.startsWith("spa") || value.includes("spanish") || value.includes("espanol")) return "es";
  if (value === "fr" || value.startsWith("fra") || value.startsWith("fre") || value.includes("french")) return "fr";
  if (value === "de" || value.startsWith("deu") || value.startsWith("ger") || value.includes("german")) return "de";
  if (value === "pt" || value.startsWith("por") || value.includes("portuguese")) return "pt";
  if (value === "ar" || value.startsWith("ara") || value.includes("arabic")) return "ar";
  if (value === "hi" || value.startsWith("hin") || value.includes("hindi")) return "hi";
  if (value === "it" || value.startsWith("ita") || value.includes("italian")) return "it";
  if (value === "ru" || value.startsWith("rus") || value.includes("russian")) return "ru";
  if (value === "ko" || value.startsWith("kor") || value.includes("korean")) return "ko";
  if (value === "zh" || value.startsWith("zho") || value.startsWith("chi") || value.includes("chinese")) return "zh";
  if (value.length >= 2) return value.slice(0, 2);
  return "und";
}

function getLanguageDisplayName(lang?: string): string {
  const code = normalizeTrackLanguage(lang);
  return LANGUAGE_DISPLAY_NAMES[code] || code.toUpperCase();
}

function isGenericTrackTitle(title: string): boolean {
  const normalized = String(title || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "default" ||
    normalized === "unknown" ||
    normalized === "und" ||
    normalized === "cr" ||
    /^((audio|subtitle|video)\s+track\s+\d+)$/i.test(normalized)
  );
}

export function formatMediaTrackLabel(track: { language?: string; title?: string }): string {
  const langName = getLanguageDisplayName(track.language);
  const rawTitle = String(track.title || "").trim();
  const normalizedTitle = rawTitle.toLowerCase();
  const normalizedLang = String(track.language || "").trim().toLowerCase();

  if (
    isGenericTrackTitle(rawTitle) ||
    normalizedTitle === normalizedLang ||
    normalizedTitle === langName.toLowerCase()
  ) {
    return langName;
  }

  return `${langName} (${rawTitle})`;
}

export function toTrackLanguageCode(lang?: string): string {
  const value = String(lang || "").trim().toLowerCase();
  if (!value) return "en";
  if (value === "en" || value.includes("eng") || value.includes("english")) return "en";
  if (value === "ja" || value.includes("jap") || value.includes("japanese")) return "ja";
  if (value === "hi" || value.includes("hin") || value.includes("hindi")) return "hi";
  if (value === "ta" || value.includes("tam") || value.includes("tamil")) return "ta";
  if (value === "te" || value.includes("tel") || value.includes("telugu")) return "te";
  if (value === "ml" || value.includes("mal") || value.includes("malayalam")) return "ml";
  if (value.length >= 2) return value.slice(0, 2);
  return "en";
}

function getSubtitleDisplayKey(track: { lang?: string; label?: string }): string {
  const langKey = normalizeTrackLanguage(track.lang || track.label || "");
  const label = String(track.label || getLanguageDisplayName(langKey)).trim().toLowerCase().replace(/\s+/g, " ");
  return `${langKey}|${label}`;
}

export function dedupeInternalSubtitleTracks(
  tracks: Array<{ id: number; label: string; lang: string; default?: boolean }>,
) {
  const seen = new Set<string>();
  const deduped: Array<{ id: number; label: string; lang: string; default?: boolean }> = [];

  for (const track of tracks) {
    const key = getSubtitleDisplayKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(track);
  }
  return deduped;
}

function doesSubtitleTrackMatchPreference(
  track: { language?: string; label?: string },
  preference: string,
): boolean {
  const normalizedPreference = String(preference || "").trim().toLowerCase();
  const language = normalizeTrackLanguage(track.language);
  const label = String(track.label || "").toLowerCase();

  if (normalizedPreference === "english") return language === "en" || label.includes("english") || label.includes("eng");
  if (normalizedPreference === "spanish") return language === "es" || label.includes("spanish") || label.includes("espanol");
  if (normalizedPreference === "french") return language === "fr" || label.includes("french");
  if (normalizedPreference === "german") return language === "de" || label.includes("german");
  if (normalizedPreference === "japanese") return language === "ja" || label.includes("japanese");
  if (normalizedPreference === "portuguese") return language === "pt" || label.includes("portuguese");
  if (normalizedPreference === "arabic") return language === "ar" || label.includes("arabic");
  if (normalizedPreference === "hindi") return language === "hi" || label.includes("hindi");
  if (normalizedPreference.length === 2) return language === normalizedPreference;

  return label.includes(normalizedPreference);
}

export function getPreferredInternalSubtitleTrack(
  tracks: Array<{ id: number; lang: string; default?: boolean }>,
  subtitlePreference: string,
): { id: number; lang: string; default?: boolean } | null {
  if (!tracks.length) return null;
  const normalizedPreference = String(subtitlePreference || "").trim().toLowerCase();

  const matchByLanguage = (expected: string) =>
    tracks.find((track) => normalizeTrackLanguage(track.lang) === expected);

  if (normalizedPreference === "auto" || normalizedPreference === "english") {
    return matchByLanguage("en") || tracks.find((track) => track.default) || tracks[0];
  }

  const languageCodeByPreference: Record<string, string> = {
    spanish: "es",
    french: "fr",
    german: "de",
    japanese: "ja",
    portuguese: "pt",
    arabic: "ar",
    hindi: "hi",
  };

  const expectedCode = languageCodeByPreference[normalizedPreference] || normalizedPreference;
  return matchByLanguage(expectedCode) || matchByLanguage("en") || tracks.find((track) => track.default) || tracks[0];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSubtitleManager({
  videoRef,
  subtitles,
  customSubtitles,
  internalSubtitles,
  currentSubtitle,
  subtitleBlobs,
  isOffline,
  headers,
  sourceKey,
  settings,
  setCurrentSubtitle,
  setCustomSubtitles,
  setSubtitleBlobs,
}: UseSubtitleManagerParams) {
  const subtitleApplyStateRef = useRef<{ lang: string; selectedIndex: number; trackCount: number } | null>(null);
  const subtitleTrackSignatureRef = useRef<string>("");
  const extractedSubtitleCacheRef = useRef<Record<string, string>>({});
  const extractedSubtitlePromiseRef = useRef<
    Map<string, Promise<{ usableUrl: string; extractedUrl: string; rawUrl: string } | null>>
  >(new Map());
  const autoLoadedInternalSubtitleRef = useRef<string>("");

  const allRenderedSubtitles = useMemo(
    () => [...subtitles, ...customSubtitles],
    [subtitles, customSubtitles],
  );

  const internalSubtitleDisplayKeys = useMemo(
    () => new Set(internalSubtitles.map(getSubtitleDisplayKey)),
    [internalSubtitles],
  );

  const visibleSubtitleOptions = useMemo(() => {
    const seen = new Set(internalSubtitleDisplayKeys);
    return allRenderedSubtitles
      .map((sub, index) => ({ sub, index }))
      .filter(({ sub }) => {
        if ((sub as { internalTrackId?: number }).internalTrackId != null) return false;
        const key = getSubtitleDisplayKey(sub);
        if (seen.has(key)) return false;
        seen.add(key);
        const url = String(sub.url || "").trim();
        if (!url) return false;
        if (isBrowserReadyVttUrl(url)) return true;
        if (subtitleBlobs[url]) return true;
        return false;
      });
  }, [allRenderedSubtitles, internalSubtitleDisplayKeys, subtitleBlobs]);

  const currentInternalSubtitleTrackId = useMemo(() => {
    const index = allRenderedSubtitles.findIndex(
      (sub, subtitleIndex) => getSubtitleSelectionKey(sub, subtitleIndex) === currentSubtitle,
    );
    const internalTrackId =
      index >= 0
        ? (allRenderedSubtitles[index] as { internalTrackId?: number } | undefined)?.internalTrackId
        : undefined;
    return typeof internalTrackId === "number" ? internalTrackId : null;
  }, [allRenderedSubtitles, currentSubtitle]);

  const subtitleReferer = headers?.Referer || "";
  const subtitleUserAgent = headers?.["User-Agent"] || "";

  const handleSubtitleChange = useCallback(
    (lang: string) => {
      const video = videoRef.current;
      if (!video) return;

      // Internal/extracted subtitles are shown imperatively by the internal-track
      // loader in VideoPlayer. Bail out here so the polling effects don't disable
      // that track or re-enable competing ones (which caused stacked duplicates).
      if (lang.startsWith("internal:")) return;

      const tracks = video.textTracks;
      const orderedSubtitles = allRenderedSubtitles;
      const selectedKey = lang.trim();
      const selectedKeyLower = selectedKey.toLowerCase();

      // 1. Initially disable all tracks to clear any duplicate/orphaned subtitles
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = "disabled";
      }

      if (lang === "off") {
        subtitleApplyStateRef.current = { lang, selectedIndex: -1, trackCount: tracks.length };
        setCurrentSubtitle("off");
        return;
      }

      let selectedIndex = -1;
      const trackElements = video.querySelectorAll("track");

      // 2. Try to match tracks by their DOM element src attribute
      if (trackElements.length > 0) {
        for (let i = 0; i < trackElements.length; i++) {
          const trackElement = trackElements[i] as HTMLTrackElement;
          const track = trackElement.track;
          if (!track) continue;

          const trackSrc = trackElement.getAttribute("src") || "";
          const subIndex = orderedSubtitles.findIndex((s, idx) => {
            const subUrl = String(s.url || "").trim();
            if (!subUrl) return false;
            const blobUrl = subtitleBlobs[subUrl];
            return (
              trackSrc === subUrl ||
              trackElement.src === subUrl ||
              trackSrc === blobUrl ||
              trackElement.src === blobUrl
            );
          });

          if (subIndex >= 0) {
            const sub = orderedSubtitles[subIndex];
            const subtitleSelectionKey = getSubtitleSelectionKey(sub, subIndex).toLowerCase();

            let isMatch = false;
            if (selectedKeyLower === "auto" || selectedKeyLower === "english") {
              isMatch = doesSubtitleTrackMatchPreference(track, "english");
            } else {
              isMatch = subtitleSelectionKey === selectedKeyLower;
            }

            if (isMatch) {
              // "hidden" (not "showing"): the browser parses cues and fires
              // cuechange, but we paint them ourselves via SubtitleOverlay so
              // color/opacity/outline/position are user-styleable and sit above
              // the Anime4K canvas. Only ever enable ONE track.
              track.mode = "hidden";
              selectedIndex = subIndex;
              break;
            }
          }
        }
      }

      // 3. Fallback to index/label matching if DOM tracks aren't fully resolved yet
      if (selectedIndex < 0) {
        const englishIndex = (() => {
          for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            if (doesSubtitleTrackMatchPreference(track, "english")) return i;
          }
          return -1;
        })();

        if (lang === "auto") {
          selectedIndex = englishIndex >= 0 ? englishIndex : tracks.length > 0 ? 0 : -1;
        } else {
          for (let i = 0; i < tracks.length; i++) {
            const mappedSubtitle = orderedSubtitles[i];
            const mappedKey = mappedSubtitle ? getSubtitleSelectionKey(mappedSubtitle, i).toLowerCase() : "";
            if (mappedKey === selectedKeyLower) {
              selectedIndex = i;
              break;
            }
          }

          if (selectedIndex < 0) {
            for (let i = 0; i < tracks.length; i++) {
              const track = tracks[i];
              if (doesSubtitleTrackMatchPreference(track, selectedKeyLower)) {
                selectedIndex = i;
                break;
              }
            }
          }
        }

        if (selectedIndex >= 0 && selectedIndex < tracks.length) {
          tracks[selectedIndex].mode = "hidden";
        }
      }

      subtitleApplyStateRef.current = {
        lang,
        selectedIndex,
        trackCount: tracks.length,
      };

      setCurrentSubtitle((prev) => (prev === lang ? prev : lang));
    },
    [allRenderedSubtitles, subtitleBlobs, videoRef, setCurrentSubtitle],
  );

  const handleCustomSubtitleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      const newSub: CustomSubtitle = {
        lang: "custom",
        url: url,
        label: file.name,
      };

      setCustomSubtitles((prev) => {
        const next = [...prev, newSub];
        setCurrentSubtitle(getSubtitleSelectionKey(newSub, subtitles.length + next.length - 1));
        return next;
      });

      // Also add to blobs map immediately so it renders
      setSubtitleBlobs((prev) => ({ ...prev, [url]: url }));

      toast.success(`Loaded subtitle: ${file.name}`);
    },
    [subtitles.length, setCustomSubtitles, setCurrentSubtitle, setSubtitleBlobs],
  );

  // Prefetch subtitles and normalize to VTT
  useEffect(() => {
    const allSubs = [...subtitles, ...customSubtitles];
    if (allSubs.length === 0) {
      setSubtitleBlobs({});
      return;
    }

    let mounted = true;
    const createdBlobUrls: string[] = [];

    setSubtitleBlobs((prev) => {
      const wanted = new Set(allSubs.map((s) => String(s.url || "").trim()).filter(Boolean));
      let changed = false;
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (wanted.has(key)) next[key] = value;
        else changed = true;
      }
      return changed ? next : prev;
    });

    (async () => {
      for (const sub of allSubs) {
        if (!mounted) break;

        try {
          const subtitleSourceUrl = String(sub.url || "").trim();
          if (!subtitleSourceUrl) continue;

          if (isBrowserReadyVttUrl(subtitleSourceUrl)) {
            if (mounted) {
              setSubtitleBlobs((prev) =>
                prev[subtitleSourceUrl] === subtitleSourceUrl
                  ? prev
                  : { ...prev, [subtitleSourceUrl]: subtitleSourceUrl },
              );
            }
            continue;
          }

          if (subtitleSourceUrl.startsWith("file://")) {
            try {
              const fileResult = await (window as any).tatakaiRuntime?.readLocalFile?.(
                subtitleSourceUrl,
              );
              if (fileResult?.success && fileResult?.url) {
                if (mounted) {
                  setSubtitleBlobs((prev) => ({
                    ...prev,
                    [subtitleSourceUrl]: fileResult.url,
                  }));
                }
                continue;
              }
            } catch (err) {
              console.warn("Failed to read local subtitle file:", subtitleSourceUrl, err);
            }
          }

          const fetchCandidates = buildSubtitleFetchCandidates(
            subtitleSourceUrl,
            subtitleReferer,
            Boolean(isOffline),
            (url, referer) => getProxiedSubtitleUrl(url, referer),
          );

          let normalizedText = "";
          for (const candidateUrl of fetchCandidates) {
            try {
              const response = await fetchViaChain(candidateUrl, {
                headers: { Accept: "text/vtt, text/plain, */*" },
                signal: AbortSignal.timeout(10000),
              });

              if (!response.ok) continue;

              normalizedText = normalizeSubtitleToVtt(await response.text());
              if (normalizedText) break;
            } catch {
              // Continue trying the next candidate URL.
            }
          }

          if (normalizedText) {
            const blob = new Blob([normalizedText], { type: "text/vtt" });
            const blobUrl = URL.createObjectURL(blob);
            createdBlobUrls.push(blobUrl);

            if (mounted) {
              setSubtitleBlobs((prev) => ({ ...prev, [subtitleSourceUrl]: blobUrl }));
            }
          } else {
            console.warn("Failed to fetch subtitle:", sub.lang, subtitleSourceUrl);
          }
        } catch (e) {
          console.warn("Error prefetching subtitle", sub.lang, e);
        }
      }
    })();

    return () => {
      mounted = false;
      createdBlobUrls.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
    };
  }, [
    subtitles,
    customSubtitles,
    subtitleReferer,
    subtitleUserAgent,
    isOffline,
    setSubtitleBlobs,
  ]);

  // Apply subtitle setting when blobs are loaded
  useEffect(() => {
    const blobsLoaded = Object.keys(subtitleBlobs).length;
    if (blobsLoaded === 0) return;

    const timeout = setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;
      const tracks = video.textTracks;
      const signature =
        Array.from({ length: tracks.length }, (_, index) => {
          const track = tracks[index];
          const state = (track as any).readyState ?? 0;
          return `${track.language}|${track.label}|${track.kind}|${state}|${track.cues?.length ?? 0}`;
        }).join("||") + `||select:${currentSubtitle}`;

      if (!signature || signature === subtitleTrackSignatureRef.current) return;
      subtitleTrackSignatureRef.current = signature;
      handleSubtitleChange(currentSubtitle);
    }, 500);

    return () => clearTimeout(timeout);
  }, [subtitleBlobs, customSubtitles, currentSubtitle, subtitles, videoRef, handleSubtitleChange]);

  // Ensure subtitles are applied when tracks become available
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const applyOnceTracksAvailable = () => {
      const tracks = video.textTracks;
      if (tracks && tracks.length > 0) {
        const signature =
          Array.from({ length: tracks.length }, (_, index) => {
            const track = tracks[index];
            return `${track.language}|${track.label}|${track.kind}|${track.readyState}|${track.cues?.length ?? 0}`;
          }).join("||") + `||select:${currentSubtitle}`;

        if (!signature || signature === subtitleTrackSignatureRef.current) return;
        subtitleTrackSignatureRef.current = signature;
        handleSubtitleChange(currentSubtitle);
      }
    };

    applyOnceTracksAvailable();

    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      applyOnceTracksAvailable();
      if (attempts > 6) clearInterval(interval);
    }, 300);

    return () => clearInterval(interval);
  }, [currentSubtitle, subtitles, customSubtitles, videoRef, handleSubtitleChange]);

  // Re-assert the selected track after a media reset. hls.js recoverMediaError,
  // MSE source-buffer resets, live-manifest reloads and torrent-seek `src` swaps
  // all silently flip every TextTrack back to "disabled", which is why torrent
  // subtitles "work then stop until you reselect". These events fire on each
  // such reset; we clear the signature gate and re-run the selection so the
  // track comes back on its own.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!currentSubtitle || currentSubtitle === "off") return;
    if (currentSubtitle.startsWith("internal:")) return;

    const reapply = () => {
      // Defer so hls.js/the browser finish rebuilding textTracks first.
      window.setTimeout(() => {
        if (!videoRef.current) return;
        const tracks = videoRef.current.textTracks;
        const anyEnabled = Array.from({ length: tracks.length }).some(
          (_, i) => tracks[i].mode !== "disabled",
        );
        if (anyEnabled) return; // Already active — nothing dropped.
        subtitleTrackSignatureRef.current = "";
        handleSubtitleChange(currentSubtitle);
      }, 120);
    };

    video.addEventListener("loadeddata", reapply);
    video.addEventListener("canplay", reapply);
    video.addEventListener("play", reapply);
    video.addEventListener("seeked", reapply);
    return () => {
      video.removeEventListener("loadeddata", reapply);
      video.removeEventListener("canplay", reapply);
      video.removeEventListener("play", reapply);
      video.removeEventListener("seeked", reapply);
    };
  }, [currentSubtitle, videoRef, handleSubtitleChange]);

  return {
    handleSubtitleChange,
    handleCustomSubtitleUpload,
    visibleSubtitleOptions,
    currentInternalSubtitleTrackId,
    allRenderedSubtitles,
    extractedSubtitleCacheRef,
    extractedSubtitlePromiseRef,
    autoLoadedInternalSubtitleRef,
  };
}
