import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, Minus, Plus, Save, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { uploadUserMedia } from '@/lib/userMedia';
import { isAllowedImageUrl } from '@/lib/imageHosts';
import { cn } from '@/lib/utils';
import { optimizedImageUrl, originalImageUrl } from '@/lib/media/imageUrl';

export interface LightboxImage {
  url: string;
  alt?: string;
}

interface LightboxContextValue {
  /** Open the viewer on a set of images, starting at `startIndex`. */
  open: (images: LightboxImage[], startIndex?: number) => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

/** Access the app-level image viewer. Safe no-op if no provider is mounted. */
export function useLightbox(): LightboxContextValue {
  useUiTranslation();
  return useContext(LightboxContext) ?? { open: () => {} };
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;

/** Our own Supabase storage host — uploaded media lives here and is CORS-open,
 *  so it's safe to fetch for download/save even though it isn't a public
 *  allowlisted image host. */
const SUPABASE_HOST = (() => {
  try {
    return new URL(String(import.meta.env.VITE_SUPABASE_URL || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
})();

/** A URL we're willing to fetch bytes from (download / re-upload). Either a
 *  well-known allowlisted image host, or our own Supabase storage. */
function isFetchSafe(raw: string): boolean {
  if (isAllowedImageUrl(raw)) return true;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return !!SUPABASE_HOST && (host === SUPABASE_HOST || host.endsWith(`.${SUPABASE_HOST}`));
  } catch {
    return false;
  }
}

function filenameFor(url: string): string {
  try {
    const path = new URL(url).pathname;
    const base = path.split('/').pop() || '';
    if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  } catch { /* ignore */ }
  return `image-${Date.now()}.png`;
}

/**
 * App-level image lightbox. Mount `<LightboxProvider>` once near the root; any
 * component can then call `useLightbox().open(images, index)` to view a set of
 * images fullscreen with wheel-zoom (toward the cursor), drag-pan, keyboard
 * navigation, download and save-to-your-images.
 */
export function LightboxProvider({ children }: { children: React.ReactNode }) {
  useUiTranslation();
  const [images, setImages] = useState<LightboxImage[]>([]);
  const [index, setIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((imgs: LightboxImage[], startIndex = 0) => {
    const list = (imgs || []).filter((i) => i && i.url);
    if (!list.length) return;
    setImages(list.map(image => ({ ...image, url: originalImageUrl(image.url) })));
    setIndex(Math.min(Math.max(0, startIndex), list.length - 1));
    setIsOpen(true);
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <LightboxContext.Provider value={value}>
      {children}
      <LightboxViewer
        images={images}
        index={index}
        isOpen={isOpen}
        onIndexChange={setIndex}
        onOpenChange={setIsOpen}
      />
    </LightboxContext.Provider>
  );
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

function LightboxViewer({
  images,
  index,
  isOpen,
  onIndexChange,
  onOpenChange,
}: {
  images: LightboxImage[];
  index: number;
  isOpen: boolean;
  onIndexChange: (i: number) => void;
  onOpenChange: (open: boolean) => void;
}) {
  useUiTranslation();
  const { user } = useAuth();
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const panning = useRef<{ id: number; startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [t, setT] = useState<Transform>(IDENTITY);
  const [busy, setBusy] = useState<'download' | 'save' | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  const current = images[index];
  // Keep the cache path used by thumbnails, but omit resizing for zooming.
  const cachedImageUrl = optimizedImageUrl(current?.url, null);
  const multiple = images.length > 1;

  // Reset zoom/pan whenever the visible image changes or the viewer (re)opens.
  useEffect(() => {
    setT(IDENTITY);
    setFailedImageUrl(null);
    panning.current = null;
  }, [index, isOpen]);

  const goTo = useCallback(
    (next: number) => {
      if (images.length < 2) return;
      onIndexChange((next + images.length) % images.length);
    },
    [images.length, onIndexChange],
  );

  /** Multiply the current scale by `factor`, keeping the point (cx, cy)
   *  — measured from the container centre — fixed under the cursor. */
  const zoomBy = useCallback((factor: number, cx = 0, cy = 0) => {
    setT((prev) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor));
      if (scale === prev.scale) return prev;
      if (scale <= MIN_SCALE) return IDENTITY;
      const ratio = scale / prev.scale;
      return { scale, x: cx - ratio * (cx - prev.x), y: cy - ratio * (cy - prev.y) };
    });
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, cx, cy);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (t.scale <= MIN_SCALE) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panning.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, ox: t.x, oy: t.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = panning.current;
    if (!p || p.id !== e.pointerId) return;
    setT((prev) => ({ ...prev, x: p.ox + (e.clientX - p.startX), y: p.oy + (e.clientY - p.startY) }));
  };

  const endPan = (e: React.PointerEvent) => {
    if (panning.current?.id === e.pointerId) panning.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.4); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.4); }
    else if (e.key === '0') { e.preventDefault(); setT(IDENTITY); }
  };

  const openExternal = () => {
    if (!current) return;
    const bridge = (window as any).electron;
    if (bridge?.openExternal) bridge.openExternal(current.url);
    else window.open(current.url, '_blank', 'noopener,noreferrer');
  };

  const download = async () => {
    if (!current || busy) return;
    if (!isFetchSafe(current.url)) { toast.error(translate('media.viewer.hostNotAllowedDownload')); return; }
    setBusy('download');
    try {
      const res = await fetch(current.url);
      if (!res.ok) throw new Error(uiI18n.t('app.http_i18n_value_0_63a176f2', { value0: res.status }));
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = filenameFor(current.url);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(obj);
    } catch (err) {
      toast.error(translate('media.viewer.downloadFailed'), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!current || busy) return;
    if (!user) { toast.error(translate('media.viewer.signInToSave')); return; }
    if (!isFetchSafe(current.url)) { toast.error(translate('media.viewer.hostNotAllowedSave')); return; }
    setBusy('save');
    try {
      const res = await fetch(current.url);
      if (!res.ok) throw new Error(uiI18n.t('app.http_i18n_value_0_63a176f2', { value0: res.status }));
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
      const file = new File([blob], `saved-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
      await uploadUserMedia(file, user.id, 'forum_image');
      queryClient.invalidateQueries({ queryKey: ['user-media', user.id] });
      toast.success(translate('media.viewer.savedToImages'));
    } catch (err) {
      toast.error(translate('media.viewer.saveFailed'), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const ToolBtn = ({ icon: Icon, label, onClick, disabled }: { icon: any; label: string; onClick: () => void; disabled?: boolean }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
          aria-label={translate('media.viewer.title')}
          className="fixed inset-0 z-[70] flex flex-col outline-none focus:outline-none [.desktop-app_&]:pt-8"
        >
          <DialogPrimitive.Title className="sr-only">{translate('media.viewer.title')}</DialogPrimitive.Title>

          {/* Top bar: counter + tools */}
          <div className="relative z-10 flex items-center justify-between gap-3 p-3 md:p-4">
            <span className="rounded-full bg-black/40 px-3 py-1 text-xs font-semibold tabular-nums text-white/80">
              {multiple ? uiI18n.t('app.i18n_value_0_i18n_value_1_68ff458e', { value0: index + 1, value1: images.length }) : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <ToolBtn icon={Minus} label={translate('media.viewer.zoomOut')} onClick={() => zoomBy(1 / 1.4)} disabled={t.scale <= MIN_SCALE} />
              <ToolBtn icon={Plus} label={translate('media.viewer.zoomIn')} onClick={() => zoomBy(1.4)} disabled={t.scale >= MAX_SCALE} />
              <ToolBtn icon={busy === 'download' ? Loader2 : Download} label={translate('media.viewer.download')} onClick={download} disabled={!!busy} />
              <ToolBtn icon={ExternalLink} label={translate('media.viewer.openNewTab')} onClick={openExternal} />
              {user && <ToolBtn icon={busy === 'save' ? Loader2 : Save} label={translate('media.viewer.saveToImages')} onClick={save} disabled={!!busy} />}
              <ToolBtn icon={X} label={translate('common.close')} onClick={() => onOpenChange(false)} />
            </div>
          </div>

          {/* Image stage */}
          <div
            ref={containerRef}
            onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-24"
          >
            {current && (
              <img
                key={current.url}
                data-image-original
                src={failedImageUrl === cachedImageUrl ? current.url : cachedImageUrl}
                onError={() => {
                  if (cachedImageUrl !== current.url) setFailedImageUrl(cachedImageUrl!);
                }}
                alt={current.alt || ''}
                draggable={false}
                onDoubleClick={() => setT((prev) => (prev.scale > MIN_SCALE ? IDENTITY : { scale: 2, x: 0, y: 0 }))}
                style={{
                  transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
                  transition: panning.current ? 'none' : 'transform 0.12s ease-out',
                  cursor: t.scale > MIN_SCALE ? 'grab' : 'zoom-in',
                }}
                className="max-h-full max-w-full select-none object-contain"
              />
            )}

            {multiple && (
              <>
                <button
                  type="button"
                  aria-label={translate('media.viewer.previousImage')}
                  onClick={(e) => { e.stopPropagation(); goTo(index - 1); }}
                  className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label={translate('media.viewer.nextImage')}
                  onClick={(e) => { e.stopPropagation(); goTo(index + 1); }}
                  className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}


