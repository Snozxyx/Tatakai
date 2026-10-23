import { useEffect, useRef, useState } from "react";
import type {
  TranslationBridge,
  TranslationPage,
} from "@/core/translate/types";

export function PageThumbnail({
  page,
  bridge,
  index,
}: {
  page: TranslationPage;
  bridge: TranslationBridge;
  index: number;
}) {
  const target = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [image, setImage] = useState("");
  const content = JSON.stringify(page);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    bridge
      .request("render", { pageId: page.id, maxWidth: 96 })
      .then((result) => {
        if (!disposed) setImage(`data:image/png;base64,${result.png}`);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [bridge, visible, content, page.id]);
  return (
    <span
      ref={target}
      className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted text-lg tabular-nums text-muted-foreground"
    >
      {image ? (
        <img alt="" src={image} className="size-full object-contain" />
      ) : (
        index + 1
      )}
    </span>
  );
}
