import {
  ScoreBadge,
  MetaBadge,
  AdultBadge,
} from "@/components/MediaCardBadges";
import { TatakaiAnimeViews } from "@/components/media/TatakaiAnimeViews";
import type { tvCardMetadata } from "@/core/tv/cardMetadata";
import uiI18n from "@/lib/uiI18n";
export function TVCardFacts({
  metadata,
  viewId,
  adult,
  expanded = false,
}: {
  metadata: ReturnType<typeof tvCardMetadata>;
  viewId?: string;
  adult?: boolean;
  expanded?: boolean;
}) {
  return (
    <div className="tv-card-facts">
      {adult && <AdultBadge />}
      {metadata.score && <ScoreBadge score={metadata.score} />}
      {metadata.type && <MetaBadge>{metadata.type}</MetaBadge>}
      {metadata.year && <MetaBadge>{metadata.year}</MetaBadge>}
      {metadata.contentRating && (
        <MetaBadge>{metadata.contentRating}</MetaBadge>
      )}
      {!!metadata.sub && (
        <MetaBadge>
          {metadata.sub} {uiI18n.t("app.sub_5d85613a")}
        </MetaBadge>
      )}
      {!!metadata.dub && (
        <MetaBadge>
          {metadata.dub} {uiI18n.t("app.dub_1ca4b285")}
        </MetaBadge>
      )}
      {!!metadata.chapters && (
        <MetaBadge>
          {metadata.chapters} {uiI18n.t("app.ch_482bd64c")}
        </MetaBadge>
      )}
      {expanded && metadata.status && <MetaBadge>{metadata.status}</MetaBadge>}
      {viewId && <TatakaiAnimeViews animeId={viewId} />}
    </div>
  );
}
export function TVCardTags({
  tags,
  expanded = false,
}: {
  tags: string[];
  expanded?: boolean;
}) {
  if (!tags.length) return null;
  return (
    <div className="tv-card-tags">
      {tags.slice(0, expanded ? 6 : 2).map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}
