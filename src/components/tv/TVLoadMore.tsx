import { useEffect, useRef } from "react";
import { installTVPagination } from "@/core/tv/pagination";
export function TVLoadMore({
  hasMore,
  busy,
  load,
  label = "Load more",
}: {
  hasMore?: boolean;
  busy: boolean;
  load(): unknown;
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const latest = useRef(load);
  latest.current = load;
  const ready = useRef(false);
  ready.current = !!hasMore && !busy;
  const pagination = useRef<ReturnType<typeof installTVPagination>>();
  useEffect(() => {
    if (!hasMore || !ref.current) return;
    const instance = installTVPagination(ref.current, { ready: () => ready.current, load: () => latest.current() });
    pagination.current = instance;
    return () => { instance.cleanup(); pagination.current = undefined; };
  }, [hasMore]);
  if (!hasMore) return null;
  return (
    <div className="tv-load-more">
      <button
        ref={ref}
        aria-busy={busy}
        data-tv-key="load-more"
        onClick={() => void pagination.current?.request()}
      >
        {busy ? "Loading more…" : label}
      </button>
    </div>
  );
}
