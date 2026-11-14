import { getAssFonts, ASS_FONTS_UPDATED } from '@/core/player/ass-fonts';
import { getCustomSubtitleFontDataUrl, CUSTOM_SUBTITLE_FONT_UPDATED_EVENT } from '@/lib/video/customSubtitleFont';
import { useEffect, useState } from 'react';
import { getOriginalSubtitleUrl } from '@/lib/api/proxy-utils';
import { fetchViaChain } from '@/core/network/proxyChain';
import { getSubtitleSelectionKey } from '@/core/player/subtitle-utils';
import { decodeSubtitle, prepareSubtitle } from '@/core/player/subtitle-service';
import { isMobileProxyUrl, fetchMobileProxyText } from '@/core/extensions/mobile/mobileProxy';
import type { ExternalSubtitle } from '../VideoPlayer.types';

export function selectSubtitleTrack(tracks: ExternalSubtitle[], selection: string): ExternalSubtitle | undefined {
  if (selection === 'off' || !tracks.length) return undefined;
  const exact = tracks.find((track,index) => getSubtitleSelectionKey(track,index) === selection);
  if (exact) return exact;
  const aliases: Record<string,string> = { auto:'en',english:'en',japanese:'ja',spanish:'es',french:'fr',german:'de',hindi:'hi',portuguese:'pt',arabic:'ar',russian:'ru',korean:'ko',chinese:'zh' };
  const language = aliases[selection.toLowerCase()] || selection.toLowerCase().split('-')[0];
  return tracks.find(track => track.lang.toLowerCase().split('-')[0] === language || track.label?.toLowerCase().includes(selection.toLowerCase())) || tracks[0];
}

export function useAssSubtitle(tracks: ExternalSubtitle[], selection: string, referer?: string, userAgent?: string) {
  const [importedFonts,setImportedFonts] = useState(getAssFonts);
  useEffect(() => { const update=()=>setImportedFonts(getAssFonts());window.addEventListener(ASS_FONTS_UPDATED,update);return ()=>window.removeEventListener(ASS_FONTS_UPDATED,update); },[]);
  const [customFont, setCustomFont] = useState(getCustomSubtitleFontDataUrl);
  useEffect(() => { const update = () => setCustomFont(getCustomSubtitleFontDataUrl()); window.addEventListener(CUSTOM_SUBTITLE_FONT_UPDATED_EVENT,update); return () => window.removeEventListener(CUSTOM_SUBTITLE_FONT_UPDATED_EVENT,update); }, []);
  const track = selectSubtitleTrack(tracks, selection);
  const [loaded, setLoaded] = useState<{ url: string; content: string } | null>(null);
  const source = track?.originalUrl || track?.url;
  useEffect(() => {
    setLoaded(null);
    if (!track || track.assContent || !source) return;
    const controller = new AbortController();
    void (async () => {
      const urls = [...new Set([track.url, source, getOriginalSubtitleUrl(source, track.headers?.Referer || referer, track.headers?.['User-Agent'] || userAgent)])];
      for (const url of urls) {
        if (controller.signal.aborted) return;
        try {
          let text: string;
          if (isMobileProxyUrl(url)) text = await fetchMobileProxyText(url, { originalUrl: track.originalUrl, headers: track.headers, timeoutMs: 10000 }) || '';
          else if (url.startsWith('file:')) {
            const result = await (window as any).tatakaiRuntime?.readLocalFile?.(url, true);
            if (!result?.success) continue;
            text = decodeSubtitle(await (await fetch(result.url, {signal:controller.signal})).arrayBuffer());
          } else {
            const response = await fetchViaChain(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), headers: { Accept: 'text/x-ssa,text/plain,text/vtt,*/*' } });
            if (!response.ok) continue;
            text = decodeSubtitle(await response.arrayBuffer());
          }
          const document = prepareSubtitle(text);
          if (document.assContent) { if (!controller.signal.aborted) setLoaded({ url:source, content:document.assContent }); return; }
          // A converter URL may return VTT for an original ASS; keep trying raw candidates.
          if (url === source && !/\.(ass|ssa)(?:[?#]|$)/i.test(source)) return;
        } catch { /* Try the header-aware raw proxy next. */ }
      }
    })();
    return () => controller.abort();
  }, [source, track?.url, track?.assContent, referer, userAgent]);
  const content = track?.assContent || (loaded && loaded.url === source ? loaded.content : undefined);
  return content ? { content, fonts: [...importedFonts, ...(track?.fonts || []), ...(customFont ? [customFont] : [])], key: source || content } : null;
}
