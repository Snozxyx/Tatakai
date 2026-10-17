import { loadMobileConfig } from '@/hooks/ui/useMobileConfig';
import './refreshed.css';

/** Shared phone-width presentation, independent of the native shell. */
export function applyMobileLayout(): void {
  const root = document.documentElement;
  if (root.classList.contains('tatakai-tv')) { delete root.dataset.mobileLayout; return; }
  if (window.matchMedia('(max-width: 1023px)').matches) root.dataset.mobileLayout = loadMobileConfig().mobileLayout;
  else delete root.dataset.mobileLayout;
}

let installed = false;
export function installMobileLayout(): void {
  if (installed) return;
  installed = true;
  applyMobileLayout();
  window.matchMedia('(max-width: 1023px)').addEventListener('change', applyMobileLayout);
  window.addEventListener('tatakai-mobile-config-updated', applyMobileLayout);
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === 'tatakai_mobile_config') applyMobileLayout();
  });
}
