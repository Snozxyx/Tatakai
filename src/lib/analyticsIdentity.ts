import { randomUUID } from './uuid';
/** A device visitor persists; a visit session expires after 30 minutes idle. */
let memoryVisitor = '';
let memorySession = { id: '', at: 0 };
export function getVisitorId() {
  try {
    let id = localStorage.getItem('tatakai_session_id');
    if (!id) {
      id = randomUUID();
      localStorage.setItem('tatakai_session_id', id);
    }
    return id;
  } catch {
    return (memoryVisitor ||= randomUUID());
  }
}
export function getVisitSessionId(now = Date.now()) {
  let session = memorySession;
  try {
    session =
      JSON.parse(localStorage.getItem('tatakai_visit_session') || 'null') ||
      session;
  } catch {
    /* memory fallback */
  }
  if (
    !session.id ||
    !Number.isFinite(session.at) ||
    now - session.at > 30 * 60_000
  )
    session = { id: randomUUID(), at: now };
  session.at = now;
  memorySession = session;
  try {
    localStorage.setItem('tatakai_visit_session', JSON.stringify(session));
  } catch {
    /* memory fallback */
  }
  return session.id;
}
