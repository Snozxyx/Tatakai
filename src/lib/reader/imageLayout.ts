import type { CSSProperties } from 'react';

export function readerImageLayout(
  style: CSSProperties,
  page: { width?: number | null; height?: number | null },
  loaded: boolean
) {
  const ratio =
    page.width > 0 && page.height > 0
      ? `${page.width} / ${page.height}`
      : undefined;
  return {
    slot: {
      ...style,
      ...(ratio
        ? { aspectRatio: ratio }
        : !loaded && !style.height
        ? { minHeight: "32vh" }
        : {}),
    } as CSSProperties,
    image: {
      width: style.width === "auto" ? "auto" : "100%",
      height: style.height || "auto",
      maxWidth: "100%",
      maxHeight: style.maxHeight,
    } as CSSProperties,
  };
}
