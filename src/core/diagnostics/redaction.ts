const PRIVATE_KEY = /(?:authorization|cookie|secret|token|api.?key|password|email|account.?id|user.?id|signed|credential)/i;
export function redactDiagnostics(value: unknown, secrets: string[] = []): unknown {
  if (Array.isArray(value)) return value.slice(0, 500).map(item => redactDiagnostics(item, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, PRIVATE_KEY.test(key) ? '[redacted]' : redactDiagnostics(item, secrets)]));
  if (typeof value !== 'string') return value;
  let text = value;
  for (const secret of secrets) if (secret.length >= 6) text = text.split(secret).join('[redacted]');
  return text.slice(0, 100_000)
    .replace(/https?:\/\/[^\s"'<>]+/gi, raw => {
      try { const url = new URL(raw); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return `${url.origin}/[path]`; } catch { return '[url]'; }
    })
    .replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:api[-_]?key|token|secret|password|cookie|authorization|account[-_]?id|user[-_]?id)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '[credential redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token redacted]')
    .replace(/[A-Z]:[\\/][^\r\n"'<>]+|\/(?:Users|home|data|storage|private|var|tmp)\/[^\r\n"'<>]+/gi, '[local path]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]');
}

