/**
 * Friendly messages for the server-side UGC guard (20260925000600_ugc_guard.sql).
 *
 * Comments / forum_posts / reports write straight to Supabase from the browser,
 * so the BEFORE INSERT triggers surface as PostgREST errors whose message
 * carries a machine tag: `UGC_RATE_LIMIT: ...` or `UGC_AUTOMOD_BLOCKED: <cat>`.
 * Map those to human copy; fall back to the raw message for anything else.
 */

export interface UgcErrorLike {
  message?: string | null;
}

/**
 * Translate a Supabase/PostgREST error into a user-facing string. Returns null
 * when the error is not a recognised UGC-guard rejection, so callers can decide
 * whether to show the raw message.
 */
export function mapUgcError(error: UgcErrorLike | null | undefined): string | null {
  const msg = String(error?.message || "");
  if (!msg) return null;

  if (msg.includes("UGC_RATE_LIMIT")) {
    return "You're doing that too fast. Please wait a moment and try again.";
  }
  if (msg.includes("UGC_AUTOMOD_BLOCKED")) {
    const category = msg.includes("piracy")
      ? "links to piracy sources aren't allowed"
      : msg.includes("illegal")
        ? "references to illegal content aren't allowed"
        : "content wasn't allowed";
    return `Your submission was blocked: ${category}.`;
  }
  return null;
}

/**
 * Convenience: the message to show, preferring the friendly mapping and falling
 * back to `${prefix}${raw}` for unrecognised errors.
 */
export function ugcErrorMessage(
  error: UgcErrorLike | null | undefined,
  prefix = ""
): string {
  const friendly = mapUgcError(error);
  if (friendly) return friendly;
  return `${prefix}${String(error?.message || "Something went wrong")}`;
}
