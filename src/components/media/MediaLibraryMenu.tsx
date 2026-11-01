import { Fragment, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, Heart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAddToWatchlist,
  type WatchlistStatus,
} from "@/hooks/user/useWatchlist";
import {
  useUpsertMangaReadlist,
  type MangaReadlistStatus,
} from "@/hooks/user/useMangaReadlist";
import {
  useUpsertNovelReadlist,
  type NovelReadlistStatus,
} from "@/hooks/user/useNovelReadlist";
import {
  useCharacterFavorites,
  useToggleCharacterFavorite,
} from "@/hooks/user/useCharacterFavorites";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
export interface LibraryMenuItem {
  kind: "anime" | "manga" | "novel" | "character";
  id: string;
  name: string;
  poster?: string;
  format?: string;
  anilistId?: number | null;
}

/**
 * Default overlay position for the quick-action button. Cards that mount the
 * button somewhere specific (e.g. inside the poster image) override it via
 * `className` — see MediaCardFrame, which anchors it to the poster's bottom
 * corner instead of floating it over the title/meta row below.
 */
export const LIBRARY_BUTTON_CLASS =
  "absolute top-2 right-2 z-40 grid size-11 place-items-center rounded-full border border-border bg-card text-card-foreground shadow-sm pointer-events-auto";

export function CharacterQuickFavorite({
  item,
  className,
}: {
  item: LibraryMenuItem;
  className?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const favorites = useCharacterFavorites();
  const toggle = useToggleCharacterFavorite();
  const selected =
    favorites.data?.some((row) => row.character_id === item.id) || false;
  return (
    <button
      type="button"
      aria-label={t("feedback.favoriteCharacter", { name: item.name })}
      aria-pressed={selected}
      disabled={toggle.isPending}
      className={className || LIBRARY_BUTTON_CLASS}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          navigate("/auth");
          return;
        }
        toggle.mutate({
          characterId: item.id,
          characterName: item.name,
          characterImage: item.poster,
        });
      }}
    >
      <Heart className="size-5" fill={selected ? "currentColor" : "none"} />
    </button>
  );
}

/** Watchlist/readlist status mutations shared by the kebab and the context menu. */
function useStatusActions(item: LibraryMenuItem) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const anime = useAddToWatchlist();
  const manga = useUpsertMangaReadlist();
  const novel = useUpsertNovelReadlist();
  const statuses =
    item.kind === "anime"
      ? ["watching", "plan_to_watch", "completed", "on_hold", "dropped"]
      : ["reading", "plan_to_read", "completed", "on_hold", "dropped"];
  const setStatus = (status: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (item.kind === "anime")
      anime.mutate({
        animeId: item.id,
        animeName: item.name,
        animePoster: item.poster,
        status: status as WatchlistStatus,
        anilistId:
          item.anilistId ||
          Number(item.id.match(/^(?:anilist:)?(\d+)$/)?.[1]) ||
          undefined,
      });
    else if (item.kind === "novel")
      novel.mutate({
        novelId: item.id,
        novelTitle: item.name,
        novelPoster: item.poster,
        status: status as NovelReadlistStatus,
      });
    else
      manga.mutate({
        mangaId: item.id,
        mangaTitle: item.name,
        mangaPoster: item.poster,
        status: status as MangaReadlistStatus,
        ...(item.format ? { format: item.format as never } : {}),
      });
  };
  return {
    statuses,
    setStatus,
    label: (status: string) => t(`feedback.status.${status}`),
    busy: anime.isPending || manga.isPending || novel.isPending,
  };
}

/** The status-setting kebab (anime/manga). The caller positions it (usually
 *  inside the poster image) so it never floats over the title/meta row. */
function StatusKebab({
  item,
  className,
}: {
  item: LibraryMenuItem;
  className?: string;
}) {
  const { t } = useTranslation();
  const { statuses, setStatus, busy } = useStatusActions(item);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("feedback.setStatus", { name: item.name })}
          disabled={busy}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className={className || LIBRARY_BUTTON_CLASS}
        >
          <MoreHorizontal className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {statuses.map((status) => (
          <DropdownMenuItem key={status} onSelect={() => setStatus(status)}>
            {t(`feedback.status.${status}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusMenu({
  item,
  children,
}: {
  item: LibraryMenuItem;
  children: ReactNode;
}) {
  const { statuses, setStatus, label } = useStatusActions(item);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="relative min-w-0">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {statuses.map((status) => (
          <ContextMenuItem key={status} onSelect={() => setStatus(status)}>
            {label(status)}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The quick-action button for a library card, positioned by the caller. Render
 * it inside the poster image so it sits on the art instead of covering the
 * title/meta row. Pair with `MediaLibraryMenu` for right-click status access.
 */
export function LibraryMenuButton({
  item,
  className,
}: {
  item: LibraryMenuItem;
  className?: string;
}) {
  if (item.kind === "character")
    return (
      <CharacterQuickFavorite
        item={item}
        className={className || LIBRARY_BUTTON_CLASS}
      />
    );
  return (
    <StatusKebab item={item} className={className || LIBRARY_BUTTON_CLASS} />
  );
}

export function MediaLibraryMenu({
  item,
  children,
}: {
  item?: LibraryMenuItem;
  children: ReactNode;
}) {
  if (!item) return <Fragment>{children}</Fragment>;
  if (item.kind === "character")
    return <div className="relative min-w-0">{children}</div>;
  return <StatusMenu item={item}>{children}</StatusMenu>;
}
