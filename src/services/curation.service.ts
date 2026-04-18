import { supabase } from "@/integrations/supabase/client";

export type CuratedScope = "anime" | "manga";
export type CuratedMode = "trending" | "genre" | "query" | "provider" | "media_type";

export type CuratedManualItem = {
  id: string;
  title: string;
  mediaType: CuratedScope;
  routeId: string;
  link: string | null;
  cover: string | null;
  poster?: string | null;
  image: string | null;
  anilistId: number | null;
  malId: number | null;
};

export interface CuratedHomeSection {
  id: string;
  scope: CuratedScope;
  mode: CuratedMode;
  title: string;
  description: string | null;
  query: string | null;
  genre: string | null;
  provider: string | null;
  media_type: string | null;
  max_items: number;
  position: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CuratedHomeSectionInput {
  scope: CuratedScope;
  mode?: CuratedMode;
  title: string;
  description?: string | null;
  query?: string | null;
  genre?: string | null;
  provider?: string | null;
  media_type?: string | null;
  max_items?: number;
  position?: number;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
}

const CURATION_TABLE = "curated_home_sections";

function toSafeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeManualItem(raw: unknown, fallbackScope: CuratedScope): CuratedManualItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const row = raw as Record<string, unknown>;
  const title = String(row.title || "").trim();
  const routeId = String(row.routeId || row.slug || row.id || "").trim();

  if (!title || !routeId) return null;

  const mediaType = String(row.mediaType || fallbackScope).trim().toLowerCase() === "manga"
    ? "manga"
    : "anime";

  const link = String(row.link || "").trim();
  const cover = String(row.cover || row.poster || "").trim();
  const image = String(row.image || "").trim();

  return {
    id: String(row.id || `${mediaType}-${routeId}`).trim() || `${mediaType}-${routeId}`,
    title,
    mediaType,
    routeId,
    link: link || null,
    cover: cover || null,
    image: image || null,
    anilistId: toSafeNumber(row.anilistId),
    malId: toSafeNumber(row.malId),
  };
}

function sanitizeMetadata(
  metadata: unknown,
  fallbackScope: CuratedScope,
): Record<string, unknown> {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};

  const customImage = String(source.customImage || "").trim();
  const manualItemsRaw = Array.isArray(source.manualItems) ? source.manualItems : [];
  const manualItems = manualItemsRaw
    .map((item) => sanitizeManualItem(item, fallbackScope))
    .filter(Boolean) as CuratedManualItem[];

  return {
    ...source,
    customImage: customImage || undefined,
    manualItems,
  };
}

function toSection(row: any): CuratedHomeSection {
  const scope: CuratedScope = row?.scope === "manga" ? "manga" : "anime";
  return {
    id: String(row?.id || ""),
    scope,
    mode: (row?.mode || "query") as CuratedMode,
    title: String(row?.title || "Untitled section"),
    description: typeof row?.description === "string" ? row.description : null,
    query: typeof row?.query === "string" ? row.query : null,
    genre: typeof row?.genre === "string" ? row.genre : null,
    provider: typeof row?.provider === "string" ? row.provider : null,
    media_type: typeof row?.media_type === "string" ? row.media_type : null,
    max_items: Number.isFinite(Number(row?.max_items)) ? Math.max(1, Math.min(48, Number(row.max_items))) : 12,
    position: Number.isFinite(Number(row?.position)) ? Number(row.position) : 100,
    is_active: Boolean(row?.is_active),
    metadata: sanitizeMetadata(row?.metadata, scope),
    created_by: typeof row?.created_by === "string" ? row.created_by : null,
    updated_by: typeof row?.updated_by === "string" ? row.updated_by : null,
    created_at: typeof row?.created_at === "string" ? row.created_at : "",
    updated_at: typeof row?.updated_at === "string" ? row.updated_at : "",
  };
}

export async function fetchCuratedHomeSections(
  scope: CuratedScope,
  options?: { includeInactive?: boolean }
): Promise<CuratedHomeSection[]> {
  const includeInactive = Boolean(options?.includeInactive);

  let query = (supabase
    .from(CURATION_TABLE as any)
    .select("*")
    .eq("scope", scope)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false }) as any);

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return Array.isArray(data) ? data.map(toSection) : [];
}

export async function createCuratedHomeSection(
  input: CuratedHomeSectionInput,
  userId?: string | null
): Promise<CuratedHomeSection> {
  const payload = {
    scope: input.scope,
    // Keep DB-compatible mode while curation logic is fully manual via metadata.manualItems.
    mode: "query",
    title: input.title.trim(),
    description: input.description?.trim() || null,
    query: input.query?.trim() || null,
    genre: input.genre?.trim() || null,
    provider: input.provider?.trim() || null,
    media_type: input.media_type?.trim() || null,
    max_items: Number.isFinite(Number(input.max_items)) ? Number(input.max_items) : 12,
    position: Number.isFinite(Number(input.position)) ? Number(input.position) : 100,
    is_active: typeof input.is_active === "boolean" ? input.is_active : true,
    metadata: sanitizeMetadata(input.metadata, input.scope),
    created_by: userId || null,
    updated_by: userId || null,
  };

  const { data, error } = await (supabase
    .from(CURATION_TABLE as any)
    .insert(payload)
    .select("*")
    .single() as any);

  if (error) throw error;
  return toSection(data);
}

export async function updateCuratedHomeSection(
  id: string,
  patch: Partial<CuratedHomeSectionInput>,
  userId?: string | null
): Promise<CuratedHomeSection> {
  const payload: Record<string, unknown> = {
    updated_by: userId || null,
  };

  if (typeof patch.scope === "string") payload.scope = patch.scope;
  if (typeof patch.mode === "string") payload.mode = "query";
  if (typeof patch.title === "string") payload.title = patch.title.trim();
  if (typeof patch.description === "string" || patch.description === null) {
    payload.description = patch.description?.trim() || null;
  }
  if (typeof patch.query === "string" || patch.query === null) {
    payload.query = patch.query?.trim() || null;
  }
  if (typeof patch.genre === "string" || patch.genre === null) {
    payload.genre = patch.genre?.trim() || null;
  }
  if (typeof patch.provider === "string" || patch.provider === null) {
    payload.provider = patch.provider?.trim() || null;
  }
  if (typeof patch.media_type === "string" || patch.media_type === null) {
    payload.media_type = patch.media_type?.trim() || null;
  }
  if (typeof patch.max_items === "number") payload.max_items = Math.max(1, Math.min(48, Math.round(patch.max_items)));
  if (typeof patch.position === "number") payload.position = Math.round(patch.position);
  if (typeof patch.is_active === "boolean") payload.is_active = patch.is_active;
  if (patch.metadata && typeof patch.metadata === "object") {
    payload.metadata = sanitizeMetadata(patch.metadata, (patch.scope as CuratedScope) || "anime");
  }

  const { data, error } = await (supabase
    .from(CURATION_TABLE as any)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single() as any);

  if (error) throw error;
  return toSection(data);
}

export async function deleteCuratedHomeSection(id: string): Promise<void> {
  const { error } = await (supabase
    .from(CURATION_TABLE as any)
    .delete()
    .eq("id", id) as any);

  if (error) throw error;
}
