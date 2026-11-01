import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** History-entry positions stay separate for different filters and visits. */
export function useScrollRestoration(key: string, options: { useWindow?: boolean; delay?: number; ready?: boolean } = {}) {
  const { useWindow = false, ready = true } = options;
  const location = useLocation(); const navigation = useNavigationType();
  const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = `tatakai_scroll_v2_${key}_${location.key}_${location.pathname}${location.search}`;
  useLayoutEffect(() => {
    const root = useWindow ? document.scrollingElement : scrollRef.current;
    if (!root) return;
    const target = useWindow ? window : root;
    let position = root.scrollTop, saved = 0;
    try { saved = Number(sessionStorage.getItem(storageKey)) || 0; } catch { /* unavailable */ }
    let restoring = navigation === 'POP' && saved > 0;
    let frame = 0;
    const save = () => { if (restoring) return; try { sessionStorage.setItem(storageKey, String(position)); } catch { /* unavailable */ } };
    const onScroll = () => { if (!restoring) { position = root.scrollTop; save(); } };
    const restore = () => {
      if (!restoring || !ready) return;
      root.scrollTop = saved;
      if (root.scrollHeight - root.clientHeight >= saved - 1) { restoring = false; position = root.scrollTop; }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); };
    const cancel = () => { restoring = false; position = root.scrollTop; save(); };
    const resize = new ResizeObserver(schedule); resize.observe(useWindow ? document.body : root);
    const mutations = new MutationObserver(schedule); mutations.observe(root, { childList:true, subtree:true });
    target.addEventListener('scroll', onScroll, { passive:true });
    window.addEventListener('pagehide', save);
    const inputs = ['wheel','touchstart','pointerdown','keydown'] as const;
    inputs.forEach(event => window.addEventListener(event, cancel, { passive:true }));
    restore();
    const deadline = window.setTimeout(() => { cancel(); resize.disconnect(); mutations.disconnect(); }, 10000);
    return () => { save(); clearTimeout(deadline); cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); target.removeEventListener('scroll', onScroll); window.removeEventListener('pagehide',save); inputs.forEach(event => window.removeEventListener(event,cancel)); };
  }, [storageKey, useWindow, ready, navigation]);
  return scrollRef;
}
