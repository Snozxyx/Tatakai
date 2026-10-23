import { TVLoadMore } from "@/components/tv/TVLoadMore";
import { CompatibilityExtensionsPanel } from '@/components/extensions/CompatibilityExtensionsPanel';
import { InstalledCompatibilityExtensions } from '@/components/extensions/InstalledCompatibilityExtensions';
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Check, Trash2, Puzzle } from "lucide-react";
import {
  useStoreCatalogue,
  useExtensionInstaller,
} from "@/hooks/api/useExtensionStore";
export default function TVExtensionsPage({
  extensionId,
}: {
  extensionId?: string;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const catalog = useStoreCatalogue();
  const installer = useExtensionInstaller();
  const busy = installer.install.isPending || installer.uninstall.isPending;
  const items = catalog.items.filter(
    (item) =>
      (!extensionId || item.id === extensionId || item.slug === extensionId) &&
      `${item.name} ${item.description} ${item.author}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (tab === "all" ||
        (tab === "installed" ? installer.isInstalled(item) : item.type === tab))
  );
  return (
    <div className="tv-page">
      <div className="tv-page-heading">
        <div>
          <h1>Extensions</h1>
          <p>Choose where your next story comes from.</p>
        </div>
        <input
          aria-label="Search extensions"
          placeholder="Find an extension"
          value={query}
          onChange={(event) => (setQuery(event.target.value), setPage(0))}
        />
      </div>
      <div className="tv-filter-tabs">
        {[
          ["all", "Discover"],
          ["installed", "Installed"],
          ["onlinestream", "Streaming"],
          ["torrent", "Torrents"],
          ["custom", "Other"],
        ].map(([value, label]) => (
          <button
            key={value}
            data-tv-key={`extension-filter-${value}`}
            aria-pressed={tab === value}
            onClick={() => {
              setTab(value);
              setPage(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!extensionId && <InstalledCompatibilityExtensions search={query} ecosystem="all" type={tab === 'installed' ? 'all' : tab === 'custom' ? 'manga' : tab} compatibility="all" />}
      {catalog.isLoading && <p role="status">Loading extensions…</p>}
      {catalog.serviceError && (
        <div role="status">
          <p>
            The catalogue could not be loaded. Your installed sources are still
            available.
          </p>
          <button
            onClick={() =>
              void queryClient.invalidateQueries({
                queryKey: ["extension-store", "catalogue"],
              })
            }
          >
            Retry catalogue
          </button>
        </div>
      )}
      <div className="tv-extension-grid">
        {items.slice(0, (page + 1) * 24).map((item) => {
          const active = installer.isInstalled(item);
          const state = installer.stateFor(item);
          const unsupported =
            ["external", "unavailable"].includes(item.compatibility || "") ||
            (!!item.ecosystem &&
              !["tatakai", "stremio", "seanime"].includes(item.ecosystem));
          return (
            <article key={item.id} className="tv-extension">
              <div className="tv-extension-icon">
                {item.icon ? (
                  <img src={item.icon} alt="" loading="lazy" />
                ) : (
                  <Puzzle />
                )}
              </div>
              <div>
                <h2>{item.name}</h2>
                <p className="tv-meta">
                  {item.ecosystem || "Tatakai"} · {item.type} · v{item.version}
                </p>
                <p>
                  {item.description ||
                    "Add this source to your Tatakai library."}
                </p>
                {unsupported && (
                  <p>
                    {item.compatibilityReason ||
                      "This extension is unavailable on this device."}
                  </p>
                )}
                {state === "not_loaded" && (
                  <p role="status">
                    Installed. The source has not connected yet; try loading it
                    again.
                  </p>
                )}
              </div>
              <div className="tv-actions">
                <button
                  data-tv-key={`extension-${item.id}`}
                  disabled={busy || unsupported}
                  onClick={() => installer.install.mutate({ extension: item })}
                >
                  {active ? <Check /> : <Download />}
                  {state === "installing"
                    ? "Installing…"
                    : unsupported
                    ? "Unavailable"
                    : active
                    ? "Reinstall"
                    : "Install"}
                </button>
                {active && (
                  <button
                    aria-label={`Remove ${item.name}`}
                    disabled={busy}
                    onClick={() => installer.uninstall.mutate(item)}
                  >
                    <Trash2 />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <TVLoadMore
        hasMore={items.length > (page + 1) * 24}
        busy={catalog.isFetching}
        load={() => setPage((value) => value + 1)}
        label="More extensions"
      />
      <CompatibilityExtensionsPanel />
      {!catalog.isLoading && !items.length && (
        <p>No extensions match this filter.</p>
      )}
    </div>
  );
}
