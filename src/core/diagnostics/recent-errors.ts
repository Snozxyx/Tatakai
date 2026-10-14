const entries: Array<{ at: string; level: string; message: string }> = [];
export function recordDiagnosticError(level: string, value: unknown): void {
  let message: string;
  try { message = value instanceof Error ? value.message : typeof value === 'string' ? value : JSON.stringify(value); }
  catch { message = '[unserializable]'; }
  entries.push({ at: new Date().toISOString(), level, message: String(message).slice(0, 2000) });
  if (entries.length > 100) entries.shift();
}
export function recentDiagnosticErrors() { return entries.slice(); }
