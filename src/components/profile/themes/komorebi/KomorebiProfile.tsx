import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Clock3,
  Flower2,
  Heart,
  History,
  Settings2,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { Seo } from "@/components/seo/Seo";
import { useSettingsModal } from "@/contexts/SettingsModalContext";
import {
  CosmeticAvatar,
  CosmeticName,
} from "@/components/profile/IdentityCosmetics";
import { AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { ThemeMediaItem, ThemeRendererProps } from "../types";
import "./komorebi.css";

function Shelf({ items, empty }: { items: ThemeMediaItem[]; empty: string }) {
  return items.length ? (
    <div className="km-shelf">
      {items.map((item) => (
        <Link key={item.id} to={item.href}>
          <div className="km-cover">
            {item.image ? (
              <img src={item.image} alt="" loading="lazy" />
            ) : (
              <BookOpen size={32} />
            )}
          </div>
          <strong>{item.title}</strong>
          <span>{item.detail || item.status}</span>
        </Link>
      ))}
    </div>
  ) : (
    <p className="km-empty">{empty}</p>
  );
}
export default function KomorebiProfile({ data, onBack }: ThemeRendererProps) {
  const { openSettings } = useSettingsModal();
  const [section, setSection] = useState("overview");
  const name = data.owner.display_name || data.owner.username || "Wanderer";
  const tabs = data.tabs ?? [
    { id: "overview", label: "Overview", summary: "" },
    { id: "watchlist", label: "Watchlist", summary: "" },
    { id: "history", label: "History", summary: "" },
  ];
  const collections: Record<string, ThemeMediaItem[]> = {
    watchlist: data.canViewLibrary
      ? data.sections?.watchlist ?? data.library
      : [],
    "manga-readlist": data.canViewLibrary ? data.sections?.manga ?? [] : [],
    "novel-readlist": data.isOwner ? data.sections?.novels ?? [] : [],
    history: data.canViewHistory
      ? [...data.activity, ...(data.sections?.readingHistory ?? [])]
      : [],
    vault: data.favorites,
  };
  const privateSection =
    section === "history"
      ? !data.canViewHistory
      : section === "novel-readlist"
      ? !data.isOwner
      : ["watchlist", "manga-readlist"].includes(section) &&
        !data.canViewLibrary;
  return (
    <main className="km-profile">
      <Seo title={name} description={`${name}'s profile on Tatakai.`} />
      <div className="km-world">
        <header className="km-header">
          <button type="button" onClick={onBack}>
            <ArrowLeft size={17} />
            Back
          </button>
          <Link to="/" className="km-brand">
            TATAKAI <span lang="ja">木漏れ日</span>
          </Link>
          {data.isOwner ? (
            <button
              type="button"
              aria-label="Open profile store"
              onClick={() => openSettings("profile-store")}
            >
              <Settings2 size={16} />
              <span>Profile store</span>
            </button>
          ) : (
            <span />
          )}
        </header>
        <section className="km-hero" aria-label={`${name}'s profile`}>
          <img
            className="km-art"
            src="/assets/profile-themes/komorebi/garden.webp"
            alt=""
          />
          <div className="km-hero-copy">
            <span className="km-seal" aria-hidden="true">
              <Flower2 size={24} />
            </span>
            <h1>
              <CosmeticName userId={data.owner.user_id}>{name}</CosmeticName>
            </h1>
            <p className="km-handle">@{data.owner.username || "wanderer"}</p>
            <p className="km-bio">
              {data.owner.bio || "A little space for the stories I love."}
            </p>
            <div className="km-person">
              <CosmeticAvatar userId={data.owner.user_id} className="h-14 w-14">
                <AvatarImage
                  src={data.owner.avatar_url ?? undefined}
                  alt={name}
                />
                <AvatarFallback>{name[0]}</AvatarFallback>
              </CosmeticAvatar>
              <div>
                <strong>{data.followers} followers</strong>
                <span>A world of shared stories</span>
              </div>
            </div>
            {!data.isOwner && (
              <button
                className="km-follow"
                type="button"
                disabled={data.followPending}
                onClick={data.onFollow}
              >
                {data.following ? (
                  <UserCheck size={16} />
                ) : (
                  <UserPlus size={16} />
                )}
                {data.followPending
                  ? "Please wait…"
                  : data.following
                  ? "Following"
                  : "Follow"}
                <ArrowUpRight size={17} />
              </button>
            )}
          </div>
          <div className="km-kanji" lang="ja" aria-hidden="true">
            物語のある暮らし
          </div>
        </section>
        <div className="km-summary">
          {[
            {
              icon: BookOpen,
              label: "Anime library",
              value: data.canViewLibrary ? data.stats.anime : "—",
            },
            {
              icon: Heart,
              label: "Manga library",
              value: data.canViewLibrary ? data.stats.manga : "—",
            },
            {
              icon: History,
              label: "Episodes watched",
              value: data.canViewHistory ? data.stats.episodes : "—",
            },
            {
              icon: Clock3,
              label: "Hours in stories",
              value: data.canViewHistory ? data.stats.hours : "—",
            },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <Icon size={17} />
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <nav className="km-nav" aria-label="Profile sections">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              aria-current={section === tab.id ? "page" : undefined}
              onClick={() => setSection(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="km-content">
          {data.loading ? (
            <p role="status">Opening the collection…</p>
          ) : data.error ? (
            <p role="alert">
              The collection could not load. Please refresh to try again.
            </p>
          ) : section === "overview" ? (
            <>
              <section>
                <header>
                  <h2>Recently, in my world.</h2>
                  <span>
                    <History size={14} />
                    Watch journal
                  </span>
                </header>
                <Shelf
                  items={data.canViewHistory ? data.activity.slice(0, 6) : []}
                  empty={
                    data.canViewHistory
                      ? "Your next story begins here."
                      : "Watch activity is private."
                  }
                />
              </section>
              <section>
                <header>
                  <h2>Close to the heart.</h2>
                  <span>
                    <Heart size={14} />
                    Favorite characters
                  </span>
                </header>
                <Shelf
                  items={data.favorites.slice(0, 6)}
                  empty="No favorite characters pinned yet."
                />
              </section>
            </>
          ) : section === "streaks" ? (
            <section>
              <h2>A little every day.</h2>
              <p className="km-empty">
                {data.canViewHistory
                  ? `${data.stats.streak} day streak · Personal best ${data.stats.longestStreak} days`
                  : "Watch activity is private."}
              </p>
              {data.canViewHistory &&
                data.achievements?.map((a) => (
                  <p className="km-achievement" key={a.id}>
                    <strong>{a.title}</strong>
                    <span>{a.description}</span>
                    <span>{a.unlocked ? "Unlocked" : "In progress"}</span>
                  </p>
                ))}
            </section>
          ) : (
            <section>
              <h2>
                {tabs.find((t) => t.id === section)?.label || "Collection"}
              </h2>
              <Shelf
                items={collections[section] ?? []}
                empty={
                  privateSection
                    ? "This collection is private."
                    : "A new collection, waiting for a story."
                }
              />
            </section>
          )}
        </div>
        <footer className="km-footer">
          <span lang="ja">木漏れ日</span>
          <span>Stories, collected in the sunlight.</span>
          <div>
            {data.badges.map((b) => (
              <img key={b.key} src={b.image} alt={b.label} title={b.label} />
            ))}
          </div>
        </footer>
        {!!data.links.length && (
          <div className="km-links">
            {data.links.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
                <ArrowUpRight size={14} />
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
