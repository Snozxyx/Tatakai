/**
 * Discord Rich Presence helpers for the desktop app.
 * Honors the user preference set during setup (`tatakai_discord_rpc`).
 */

type RpcExtra = {
  startTime?: Date;
  endTime?: Date;
  smallImageKey?: string;
  smallImageText?: string;
};

function hasElectronRpc(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).electron?.updateRPC);
}

export function isDiscordRpcEnabled(): boolean {
  try {
    const raw = localStorage.getItem('tatakai_discord_rpc');
    if (raw === null) return true;
    return raw === 'true' || raw === '1';
  } catch {
    return true;
  }
}

export function updateDiscordRpc(details: string, state: string, extra: RpcExtra = {}): void {
  if (!hasElectronRpc() || !isDiscordRpcEnabled()) return;
  (window as any).electron.updateRPC({ details, state, extra });
}

export function clearDiscordRpc(): void {
  if (!hasElectronRpc()) return;
  if ((window as any).electron.clearRPC) {
    (window as any).electron.clearRPC();
    return;
  }
  if (!isDiscordRpcEnabled()) return;
  (window as any).electron.updateRPC({
    details: 'Browsing Anime',
    state: 'Main Menu',
  });
}
