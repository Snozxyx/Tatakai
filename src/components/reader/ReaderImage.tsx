import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

/** Minimal page shape the reader image needs. `MangaPage` and the custom-source
 *  `CustomReadPage` are both structurally compatible with this. */
export interface ReaderPageImage {
  pageNumber: number;
  imageUrl: string;
  proxiedImageUrl?: string | null;
  width?: number | null;
  height?: number | null;
}

/**
 * One reader page image. Blob mode fetches the (proxied) URL and shows an object
 * URL so the exact image headers the proxy replays are reused; native mode points
 * the `<img>` straight at the URL.
 *
 * Shared by the manga reader (`MangaReaderPage`) and custom-source read pages so
 * the blob/proxy subtlety lives in one place.
 */
export function ReaderImage({ page, mode, style, eager }: {
  page: ReaderPageImage;
  mode: "native" | "blob";
  style: CSSProperties;
  eager: boolean;
}) {
  const src = page.proxiedImageUrl || page.imageUrl;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (mode !== "blob") return;
    let cancelled = false;
    let obj: string | null = null;
    fetch(src)
      .then((r) => r.blob())
      .then((b) => {
        if (cancelled) return;
        obj = URL.createObjectURL(b);
        setBlobUrl(obj);
      })
      .catch(() => setBlobUrl(null));
    return () => {
      cancelled = true;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [src, mode]);

  // Reserve vertical space before the image loads so continuous-scroll append /
  // prepend doesn't cause layout jumps (and the load sentinels don't cascade
  // against a zero-height block). Use the known aspect ratio when the provider
  // reported dimensions; otherwise hold a neutral placeholder height until load.
  const aspectRatio =
    page.width && page.height ? `${page.width} / ${page.height}` : undefined;
  const reserve: CSSProperties = aspectRatio
    ? { aspectRatio }
    : loaded
      ? {}
      : { minHeight: "70vh" };

  return (
    <img
      data-page={page.pageNumber}
      src={mode === "blob" ? blobUrl ?? src : src}
      alt={`Page ${page.pageNumber}`}
      className="mx-auto block h-auto rounded-md bg-black/30"
      style={{ ...style, ...reserve }}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
    />
  );
}
