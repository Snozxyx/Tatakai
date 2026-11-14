import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { AssRendererHandle } from '@/core/player/ass-renderer';

export function AssSubtitleOverlay({ videoRef, subtitle, offset = 0, mediaKey }: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  subtitle: { content: string; fonts: string[]; key: string } | null;
  offset?: number; mediaKey?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<AssRendererHandle>();
  const offsetRef = useRef(offset); offsetRef.current = offset;
  const fontsKey = subtitle?.fonts.join('|');
  useEffect(() => {
    if (!subtitle || !videoRef.current || !host.current) return;
    const controller = new AbortController();
    let active: AssRendererHandle | undefined;
    void import('@/core/player/ass-renderer').then(module => module.createAssRenderer({ host: host.current!,
      video: videoRef.current!, content: subtitle.content, fonts: subtitle.fonts, offset: offsetRef.current,
      assetBase: new URL(import.meta.env.BASE_URL + 'assets/libass/', location.href).href, signal: controller.signal,
    })).then(value => { active = value; if (controller.signal.aborted) value.destroy(); else { renderer.current = value; value.setOffset(offsetRef.current); } })
      .catch(error => { if (!controller.signal.aborted) toast.error('ASS subtitles could not render. ' + String(error), { id:'ass-render-error' }); });
    return () => { controller.abort(); active?.destroy(); renderer.current = undefined; host.current?.replaceChildren(); };
  }, [subtitle?.key, subtitle?.content, fontsKey, mediaKey, videoRef]);
  useEffect(() => { renderer.current?.setOffset(offset); }, [offset]);
  return subtitle ? <div ref={host} data-ass-subtitles className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true" /> : null;
}
