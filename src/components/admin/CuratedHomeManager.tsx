import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Save, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { useAuth } from "@/contexts/AuthContext";
import {
  createCuratedHomeSection,
  deleteCuratedHomeSection,
  fetchCuratedHomeSections,
  updateCuratedHomeSection,
  type CuratedHomeSection,
  type CuratedHomeSectionInput,
  type CuratedManualItem,
  type CuratedScope,
} from "@/services/curation.service";

type CuratedMetadata = {
  customImage: string;
  manualItems: CuratedManualItem[];
};

type ManualItemDraft = {
  title: string;
  routeId: string;
  mediaType: CuratedScope;
  link: string;
  cover: string;
  image: string;
  anilistId: string;
  malId: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toSafeNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPreviewCard(item: CuratedManualItem): UnifiedMediaCardProps["item"] {
  const poster = String(item.cover || item.poster || item.image || "").trim() || "/placeholder.svg";
  const rawHref = String(item.link || "").trim();
  const href = rawHref && !/^https?:\/\//i.test(rawHref)
    ? (rawHref.startsWith("/") ? rawHref : `/${rawHref.replace(/^\/+/, "")}`)
    : undefined;

  return {
    id: String(item.routeId || item.id || ""),
    name: String(item.title || "Untitled").trim() || "Untitled",
    poster,
    mediaType: item.mediaType === "manga" ? "manga" : "anime",
    type: item.mediaType,
    anilistId: typeof item.anilistId === "number" ? item.anilistId : undefined,
    malId: typeof item.malId === "number" ? item.malId : undefined,
    href,
  };
}

function parseQuickAddLine(rawLine: string, fallbackScope: CuratedScope): CuratedManualItem | null {
  const line = rawLine.trim();
  if (!line) return null;

  const parts = line.split("|").map((part) => part.trim());
  const [titleInput = "", slugInput = "", coverInput = "", mediaTypeInput = "", anilistInput = "", malInput = "", linkInput = ""] = parts;

  const hasPipeFormat = parts.length > 1;
  const routeId = (hasPipeFormat ? slugInput : titleInput).trim();
  if (!routeId || /^https?:\/\//i.test(routeId)) return null;

  const normalizedTitle = hasPipeFormat
    ? titleInput
    : routeId
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const mediaType = mediaTypeInput.toLowerCase() === "manga" ? "manga" : mediaTypeInput.toLowerCase() === "anime" ? "anime" : fallbackScope;
  const cover = String(coverInput || "").trim();
  const link = String(linkInput || "").trim();
  if (link && /^https?:\/\//i.test(link)) return null;

  const title = normalizedTitle.trim();
  if (!title || !routeId) return null;

  return {
    id: `${mediaType}-${routeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    mediaType,
    routeId,
    link: link || null,
    cover: cover || null,
    image: null,
    anilistId: toSafeNumber(anilistInput),
    malId: toSafeNumber(malInput),
  };
}

function readMetadata(raw: unknown): CuratedMetadata {
  const metadata = asObject(raw);
  const customImage = String(metadata.customImage || "").trim();
  const manualItems = Array.isArray(metadata.manualItems) ? (metadata.manualItems as CuratedManualItem[]) : [];

  return {
    customImage,
    manualItems,
  };
}

function emptyManualItem(scope: CuratedScope): ManualItemDraft {
  return {
    title: "",
    routeId: "",
    mediaType: scope,
    link: "",
    cover: "",
    image: "",
    anilistId: "",
    malId: "",
  };
}

function emptyDraft(): CuratedHomeSectionInput {
  return {
    scope: "anime",
    title: "",
    description: "",
    max_items: 12,
    position: 100,
    is_active: true,
    metadata: {
      customImage: "",
      manualItems: [],
    },
  };
}

function toDraft(section: CuratedHomeSection): CuratedHomeSectionInput {
  const metadata = readMetadata(section.metadata);
  return {
    scope: section.scope,
    title: section.title,
    description: section.description,
    max_items: section.max_items,
    position: section.position,
    is_active: section.is_active,
    metadata,
  };
}

export function CuratedHomeManager() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CuratedHomeSectionInput>(emptyDraft());
  const [manualItemDraft, setManualItemDraft] = useState<ManualItemDraft>(emptyManualItem("anime"));
  const [quickAddInput, setQuickAddInput] = useState("");
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["admin-curated-home-sections"],
    queryFn: async () => {
      const [anime, manga] = await Promise.all([
        fetchCuratedHomeSections("anime", { includeInactive: true }),
        fetchCuratedHomeSections("manga", { includeInactive: true }),
      ]);
      return [...anime, ...manga].sort((left, right) => {
        if (left.scope !== right.scope) return left.scope.localeCompare(right.scope);
        if (left.position !== right.position) return left.position - right.position;
        return right.created_at.localeCompare(left.created_at);
      });
    },
  });

  const nextPositions = useMemo(() => {
    const animeRows = sections.filter((row) => row.scope === "anime");
    const mangaRows = sections.filter((row) => row.scope === "manga");

    const getNextPosition = (rows: CuratedHomeSection[]) => {
      if (!rows.length) return 10;
      const maxPosition = Math.max(...rows.map((row) => row.position || 0), 0);
      return maxPosition + 10;
    };

    return {
      anime: getNextPosition(animeRows),
      manga: getNextPosition(mangaRows),
    } as Record<CuratedScope, number>;
  }, [sections]);

  const saveMutation = useMutation({
    mutationFn: async (payload: CuratedHomeSectionInput) => {
      if (editingId) {
        return updateCuratedHomeSection(editingId, payload, user?.id);
      }
      return createCuratedHomeSection(payload, user?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-curated-home-sections"] });
      queryClient.invalidateQueries({ queryKey: ["curated-home-sections"] });
      toast.success(editingId ? "Section updated" : "Section created");
      setEditingId(null);
      setDraft(emptyDraft());
      setManualItemDraft(emptyManualItem("anime"));
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to save section");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCuratedHomeSection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-curated-home-sections"] });
      queryClient.invalidateQueries({ queryKey: ["curated-home-sections"] });
      toast.success("Section deleted");
    },
    onError: () => toast.error("Failed to delete section"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateCuratedHomeSection(id, { is_active: isActive }, user?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-curated-home-sections"] });
      queryClient.invalidateQueries({ queryKey: ["curated-home-sections"] });
    },
    onError: () => toast.error("Failed to toggle section status"),
  });

  const metadata = readMetadata(draft.metadata);

  const setDraftField = <K extends keyof CuratedHomeSectionInput>(key: K, value: CuratedHomeSectionInput[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const setManualDraftField = <K extends keyof ManualItemDraft>(key: K, value: ManualItemDraft[K]) => {
    setManualItemDraft((previous) => ({ ...previous, [key]: value }));
  };

  const setMetadata = (nextMetadata: CuratedMetadata) => {
    setDraft((previous) => ({
      ...previous,
      metadata: nextMetadata,
    }));
  };

  const handleScopeChange = (scope: CuratedScope) => {
    setDraft((previous) => ({
      ...previous,
      scope,
      position: editingId ? previous.position : nextPositions[scope],
      metadata: {
        ...readMetadata(previous.metadata),
      },
    }));
    setManualItemDraft(emptyManualItem(scope));
  };

  const addManualItem = () => {
    const title = manualItemDraft.title.trim();
    const routeId = manualItemDraft.routeId.trim();
    if (!title) {
      toast.error("Manual item title is required");
      return;
    }
    if (!routeId) {
      toast.error("Internal anime/manga slug is required");
      return;
    }
    if (/^https?:\/\//i.test(routeId)) {
      toast.error("Use internal slug in route ID, not an external URL");
      return;
    }

    const linkValue = manualItemDraft.link.trim();
    if (linkValue && /^https?:\/\//i.test(linkValue)) {
      toast.error("Use internal path in link (for example /anime/slug), not external URL");
      return;
    }

    const nextItem: CuratedManualItem = {
      id: `${manualItemDraft.mediaType}-${routeId}-${Date.now()}`,
      title,
      mediaType: manualItemDraft.mediaType,
      routeId,
      link: linkValue || null,
      cover: manualItemDraft.cover.trim() || null,
      image: manualItemDraft.image.trim() || null,
      anilistId: toSafeNumber(manualItemDraft.anilistId),
      malId: toSafeNumber(manualItemDraft.malId),
    };

    setMetadata({
      ...metadata,
      manualItems: [...metadata.manualItems, nextItem],
    });

    setManualItemDraft(emptyManualItem(draft.scope));
  };

  const removeManualItem = (itemId: string) => {
    setMetadata({
      ...metadata,
      manualItems: metadata.manualItems.filter((item) => item.id !== itemId),
    });
  };

  const applyQuickAdd = () => {
    const lines = quickAddInput
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast.error("Paste at least one line for quick add");
      return;
    }

    const parsedItems = lines
      .map((line) => parseQuickAddLine(line, draft.scope))
      .filter(Boolean) as CuratedManualItem[];

    if (parsedItems.length === 0) {
      toast.error("No valid rows found. Use: title|internal-slug|cover(optional)|type(optional)");
      return;
    }

    setMetadata({
      ...metadata,
      manualItems: [...metadata.manualItems, ...parsedItems],
    });
    setQuickAddInput("");
    toast.success(`Added ${parsedItems.length} item${parsedItems.length > 1 ? "s" : ""}`);
  };

  const previewCards = useMemo(() => {
    const items = metadata.manualItems
      .map(toPreviewCard)
      .filter((item) => item.id && item.name);

    return items.slice(0, Math.max(1, Math.min(24, Number(draft.max_items || 12))));
  }, [metadata.manualItems, draft.max_items]);

  const handleSubmit = () => {
    if (!draft.title?.trim()) {
      toast.error("Section title is required");
      return;
    }

    if (metadata.manualItems.length === 0) {
      toast.error("Add at least one anime/manga item to this section");
      return;
    }

    const positionValue = Number(draft.position);

    const payload: CuratedHomeSectionInput = {
      ...draft,
      title: draft.title.trim(),
      description: draft.description?.trim() || null,
      max_items: Number.isFinite(Number(draft.max_items)) ? Math.max(1, Math.min(48, Number(draft.max_items))) : 12,
      position:
        Number.isFinite(positionValue) && positionValue > 0
          ? Math.round(positionValue)
          : nextPositions[draft.scope],
      metadata,
    };

    saveMutation.mutate(payload);
  };

  const handleEdit = (section: CuratedHomeSection) => {
    setEditingId(section.id);
    setDraft(toDraft(section));
    setManualItemDraft(emptyManualItem(section.scope));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setManualItemDraft(emptyManualItem("anime"));
  };

  const animeSections = sections.filter((section) => section.scope === "anime");
  const mangaSections = sections.filter((section) => section.scope === "manga");

  const renderSectionList = (scope: CuratedScope, rows: CuratedHomeSection[]) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold capitalize">{scope} Homepage Sections</h3>
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{rows.length} sections</span>
      </div>

      {rows.length === 0 ? (
        <GlassPanel className="p-4 border border-dashed border-white/10">
          <p className="text-sm text-muted-foreground">No curated sections for {scope} yet.</p>
        </GlassPanel>
      ) : (
        rows.map((section) => {
          const sectionMetadata = readMetadata(section.metadata);

          return (
            <GlassPanel key={section.id} className="p-4 border border-white/10">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-bold text-base">{section.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    order {section.position} • max {section.max_items} • {sectionMetadata.manualItems.length} items
                  </p>
                  {section.description ? (
                    <p className="text-sm text-muted-foreground mt-2">{section.description}</p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toggleActiveMutation.mutate({ id: section.id, isActive: !section.is_active })
                    }
                    disabled={toggleActiveMutation.isPending}
                    className={section.is_active ? "border-emerald-500/40 text-emerald-300" : "border-zinc-600 text-zinc-400"}
                  >
                    {section.is_active ? "Active" : "Inactive"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(section)} title="Edit section">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(section.id)}
                    title="Delete section"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </GlassPanel>
          );
        })
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <GlassPanel className="p-6 border-primary/20 bg-primary/5">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              Curated Home Builder (Manual)
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Admin/Moderator can create manual sections for Anime and Manga homepages.
            </p>
          </div>
          {editingId ? (
            <Button variant="outline" onClick={handleCancelEdit}>
              Cancel Edit
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Scope</label>
            <select
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={draft.scope}
              onChange={(event) => handleScopeChange(event.target.value as CuratedScope)}
            >
              <option value="anime">Anime Homepage</option>
              <option value="manga">Manga Homepage</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Position</label>
            <Input
              className="mt-1"
              type="number"
              value={draft.position ?? nextPositions[draft.scope]}
              onChange={(event) => setDraftField("position", Number(event.target.value) || nextPositions[draft.scope])}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Section Title</label>
            <Input
              className="mt-1"
              value={draft.title || ""}
              onChange={(event) => setDraftField("title", event.target.value)}
              placeholder="Example: Editor's Picks"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
            <Textarea
              className="mt-1 min-h-[72px]"
              value={draft.description || ""}
              onChange={(event) => setDraftField("description", event.target.value)}
              placeholder="Optional subtitle shown under the section heading"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Section Cover (optional)</label>
            <Input
              className="mt-1"
              value={metadata.customImage}
              onChange={(event) => setMetadata({ ...metadata, customImage: event.target.value })}
              placeholder="https://example.com/cover.jpg"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Max Items</label>
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={48}
              value={draft.max_items ?? 12}
              onChange={(event) => setDraftField("max_items", Number(event.target.value) || 12)}
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                id="curated-home-active"
                type="checkbox"
                checked={Boolean(draft.is_active)}
                onChange={(event) => setDraftField("is_active", event.target.checked)}
              />
              Publish immediately (active)
            </label>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Manual Section Items</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Input
              value={manualItemDraft.title}
              onChange={(event) => setManualDraftField("title", event.target.value)}
              placeholder="Item title (required)"
            />
            <Input
              value={manualItemDraft.routeId}
              onChange={(event) => setManualDraftField("routeId", event.target.value)}
              placeholder="Internal anime/manga slug (required)"
            />
            <Input
              value={manualItemDraft.link}
              onChange={(event) => setManualDraftField("link", event.target.value)}
              placeholder="Optional internal link (/anime/slug)"
            />
            <Button type="button" onClick={addManualItem} className="h-10 md:col-span-2 lg:col-span-1">
              <Plus className="w-4 h-4 mr-2" />
              Add Item Fast
            </Button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAdvancedFields((previous) => !previous)}
            >
              {showAdvancedFields ? "Hide Advanced Fields" : "Show Advanced Fields"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Advanced mode lets you set cover, image, type and external IDs.
            </p>
          </div>

          {showAdvancedFields ? (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={manualItemDraft.mediaType}
              onChange={(event) => setManualDraftField("mediaType", event.target.value as CuratedScope)}
            >
              <option value="anime">Anime</option>
              <option value="manga">Manga</option>
            </select>
            <Input
              value={manualItemDraft.cover}
              onChange={(event) => setManualDraftField("cover", event.target.value)}
              placeholder="Cover URL (manual)"
            />
            <Input
              value={manualItemDraft.image}
              onChange={(event) => setManualDraftField("image", event.target.value)}
              placeholder="Optional image URL"
            />
            <Input
              value={manualItemDraft.anilistId}
              onChange={(event) => setManualDraftField("anilistId", event.target.value)}
              placeholder="AniList ID (optional)"
            />
            <Input
              value={manualItemDraft.malId}
              onChange={(event) => setManualDraftField("malId", event.target.value)}
              placeholder="MAL ID (optional)"
            />
          </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs font-semibold text-foreground">Quick Add Many</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              One per line. Format: <span className="text-foreground">title|internal-slug|cover(optional)|type(optional anime/manga)|anilist(optional)|mal(optional)|link(optional internal path)</span>
            </p>
            <Textarea
              className="mt-2 min-h-[96px]"
              value={quickAddInput}
              onChange={(event) => setQuickAddInput(event.target.value)}
              placeholder={`Solo Leveling|solo-leveling-18789|https://cdn.example.com/solo.jpg\nFrieren|frieren-beyond-journeys-end\nLookism|lookism||manga|12345`}
            />
            <div className="mt-2 flex justify-end">
              <Button type="button" variant="outline" onClick={applyQuickAdd}>
                Add Rows
              </Button>
            </div>
          </div>

          {metadata.manualItems.length > 0 ? (
            <div className="mt-4 space-y-2">
              {metadata.manualItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.mediaType} • id: {item.routeId}
                      {item.cover ? ` • cover: ${item.cover}` : ""}
                      {item.link ? ` • link: ${item.link}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeManualItem(item.id)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-3">No manual items yet. Add anime/manga cards above.</p>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Live Section Preview</h3>
            <span className="text-xs text-muted-foreground">
              {previewCards.length} / {Math.max(1, Math.min(24, Number(draft.max_items || 12)))} cards
            </span>
          </div>

          {previewCards.length === 0 ? (
            <p className="text-xs text-muted-foreground">Add manual items to preview how this curated section will appear.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {previewCards.map((item, index) => (
                <UnifiedMediaCard key={`preview-${item.mediaType}-${item.id}-${index}`} item={item} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={handleSubmit} disabled={saveMutation.isPending || !draft.title?.trim()}>
            {editingId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {editingId ? "Update Section" : "Create Section"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setDraftField("position", nextPositions[draft.scope])}
            disabled={saveMutation.isPending}
          >
            Use Next Position
          </Button>
          {editingId ? (
            <Button variant="outline" onClick={handleCancelEdit}>Reset</Button>
          ) : null}
        </div>
      </GlassPanel>

      {isLoading ? (
        <GlassPanel className="p-6">
          <p className="text-sm text-muted-foreground">Loading curated sections...</p>
        </GlassPanel>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {renderSectionList("anime", animeSections)}
          {renderSectionList("manga", mangaSections)}
        </div>
      )}
    </div>
  );
}
