export const DOWNLOAD_RESUME_EVENT = 'tatakai-download-resume-changed';
export function getDownloadAutoResume(): boolean {
  try { return localStorage.getItem('tatakai:download-auto-resume') !== 'false'; }
  catch { return true; }
}
export async function setDownloadAutoResume(enabled: boolean): Promise<void> {
  const bridge = typeof window !== 'undefined' ? window.electron : undefined;
  if (bridge?.setDownloadAutoResume) await bridge.setDownloadAutoResume(enabled);
  localStorage.setItem('tatakai:download-auto-resume', String(enabled));
  window.dispatchEvent(new Event(DOWNLOAD_RESUME_EVENT));
}
