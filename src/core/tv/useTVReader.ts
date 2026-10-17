import { useEffect } from "react";
import { isTV } from "./device";
export function useTVReader(actions: {
  next(): void;
  previous(): void;
  controls(): void;
}) {
  useEffect(() => {
    if (!isTV()) return;
    const handle = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      if (key === "Enter") actions.controls();
      else if (key === "ArrowRight" || key === "ArrowDown") actions.next();
      else if (key === "ArrowLeft" || key === "ArrowUp") actions.previous();
    };
    window.addEventListener("tatakai-tv-reader-key", handle);
    return () => window.removeEventListener("tatakai-tv-reader-key", handle);
  }, [actions]);
}
