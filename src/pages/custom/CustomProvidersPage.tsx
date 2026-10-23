import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  Film,
  Languages,
  Plus,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Background } from "@/components/layout/Background";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExtensionLogo } from "@/components/extensions/ExtensionLogo";
import { listAllCustomSources } from "@/core/content/custom-source-runtime";
import {
  customProviderKey,
  customSourceBase,
  groupCustomSources,
  sourceLanguage,
} from "@/core/content/custom-source-model";
import {
  compatibilityMutation,
  isCompatibilityNamespace,
} from "@/core/extensions/compatibility/client";
import { useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { isExplicitExtensionContent } from "@/lib/contentSafety";
import { catalogKind } from "@/core/content/custom-catalog";
import { cn } from "@/lib/utils";

const types = [
  { id: "all", label: "All", icon: Plus },
  { id: "anime", label: "Anime", icon: Film },
  { id: "manga", label: "Manga", icon: BookOpen },
  { id: "novel", label: "Novels", icon: ScrollText },
] as const;
const PAGE_SIZE = 36;

/** Installed sources, including disabled language variants. No repository-wide execution. */
export default function CustomProvidersPage() {
  const desktop = useIsDesktopApp(),
    navigate = useNavigate(),
    client = useQueryClient();
  const { settings: safety } = useContentSafetySettings();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") || "",
    type = params.get("type") || "all";
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const inventory = useQuery({
    queryKey: ["custom-provider-inventory"],
    queryFn: () => listAllCustomSources(true),
    staleTime: 60000,
    retry: false,
  });
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({
        queryKey: ["custom-provider-inventory"],
      });
    };
    window.addEventListener("tatakai-extensions-changed", refresh);
    return () =>
      window.removeEventListener("tatakai-extensions-changed", refresh);
  }, [client]);
  useEffect(() => setPage(1), [search, type, safety.showAdultEverywhere]);
  const groups = useMemo(
    () =>
      groupCustomSources(
        (inventory.data || []).filter(
          (source) =>
            safety.showAdultEverywhere || !isExplicitExtensionContent(source)
        )
      ),
    [inventory.data, safety.showAdultEverywhere]
  );
  const filtered = groups.filter(
    (group) =>
      (type === "all" || catalogKind(group) === type) &&
      [
        group.name,
        group.description,
        group.namespace,
        ...group.variants.map((v) => sourceLanguage(v.language)),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    current = Math.min(page, pages);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  async function open(group: (typeof groups)[number]) {
    const key = customProviderKey(group);
    setBusy(key);
    setError("");
    try {
      let available = group.variants.filter((v) => v.enabled !== false);
      if (!available.length && isCompatibilityNamespace(group.namespace)) {
        // Enabling a provider enables its own language variants, never unrelated packages.
        for (const variant of group.variants)
          await compatibilityMutation({
            op: "setEnabled",
            ecosystem: group.namespace.slice(7),
            sourceId: variant.id,
            enabled: true,
          });
        await client.invalidateQueries({ queryKey: ["custom-sources"] });
        available = group.variants;
      }
      const language = navigator.language.split("-")[0];
      const target =
        available.find((v) => v.language === language) ||
        available.find((v) => v.language === "en") ||
        available[0];
      if (target) navigate(customSourceBase(target));
      else
        throw Error("Enable this provider in the extension hub to browse it.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not enable provider"
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Background />
      <Sidebar />
      <main
        className={cn(
          "app-page relative z-10 mx-auto max-w-[1800px] py-6 pr-6 pb-28 md:pb-8",
          desktop ? "pl-6" : "pl-6 md:pl-32"
        )}
      >
        <Header
          providerSearch={{
            name: "providers",
            query: search,
            onSearch: (term) => update("q", term),
          }}
          providerControls={
            <span className="font-display text-xl font-bold">
              Your providers
            </span>
          }
        />
        <div className="mb-8 mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
              Discover through your extensions
            </p>
            <h1 className="font-display text-3xl font-bold md:text-4xl">
              Custom providers
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Anime, manga and novels from the extensions installed on this
              device. Languages stay together.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh providers"
              onClick={() => void inventory.refetch()}
              disabled={inventory.isFetching}
            >
              <RefreshCw
                className={cn("size-4", inventory.isFetching && "animate-spin")}
              />
            </Button>
            <Button variant="outline" asChild>
              <Link to="/extensions">
                <Plus className="size-4 mr-2" />
                Add extensions
              </Link>
            </Button>
          </div>
        </div>
        <div
          className="mb-6 flex flex-wrap items-center gap-2"
          aria-label="Provider type"
        >
          {types.map((item) => (
            <Button
              key={item.id}
              variant={type === item.id ? "default" : "outline"}
              className="rounded-full"
              aria-pressed={type === item.id}
              onClick={() => update("type", item.id)}
            >
              <item.icon className="size-4 mr-2" />
              {item.label}
              <span className="ml-2 text-xs opacity-70">
                {
                  groups.filter(
                    (g) => item.id === "all" || catalogKind(g) === item.id
                  ).length
                }
              </span>
            </Button>
          ))}
          <span className="ml-auto text-sm text-muted-foreground">
            {filtered.length} providers
          </span>
        </div>
        {(error || inventory.isError) && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>
              {error || inventory.error?.message}
            </AlertDescription>
          </Alert>
        )}
        {inventory.isPending ? (
          <p role="status" className="py-16 text-center text-muted-foreground">
            Loading installed providers…
          </p>
        ) : !filtered.length ? (
          <div className="rounded-2xl border border-dashed border-border py-16 px-6 text-center">
            <BookOpen className="mx-auto mb-4 size-8 text-muted-foreground" />
            <h2 className="font-display text-xl font-semibold">
              {search
                ? "No matching providers"
                : `No ${type === "all" ? "" : type + " "}providers available`}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              {search
                ? "Try a different name, extension or language."
                : "Install an extension in the extension hub. Disabled installed sources appear here too; unavailable runtimes must be started in the hub."}
            </p>
            <Button variant="outline" className="mt-5" asChild>
              <Link to="/extensions">Open extension hub</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered
              .slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
              .map((group) => {
                const enabled = group.variants.some((v) => v.enabled !== false),
                  kind = catalogKind(group),
                  key = customProviderKey(group);
                return (
                  <article
                    key={key}
                    className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/70 bg-card/60 p-5 transition-colors hover:border-primary/40"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <ExtensionLogo
                        name={group.name}
                        src={group.icon}
                        className="size-14 rounded-2xl"
                      />
                      <div className="min-w-0 flex-1">
                        <h2
                          className="truncate font-display text-lg font-bold"
                          title={group.name}
                        >
                          {group.name}
                        </h2>
                        <p className="truncate text-sm text-muted-foreground">
                          {group.description ||
                            group.namespace.replace("compat-", "")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "mt-1 size-2 shrink-0 rounded-full",
                          enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
                        )}
                        title={enabled ? "Enabled" : "Disabled"}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                        {kind === "novel"
                          ? "Novel"
                          : group.kind === "read"
                          ? "Manga"
                          : "Anime"}
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-1 capitalize text-muted-foreground">
                        {group.namespace.replace("compat-", "")}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground"
                        title={group.variants
                          .map((v) => sourceLanguage(v.language))
                          .join(", ")}
                      >
                        <Languages className="size-3" />
                        {group.variants.length > 1
                          ? `${group.variants.length} languages`
                          : sourceLanguage(group.language)}
                      </span>
                    </div>
                    <Button
                      variant={enabled ? "outline" : "default"}
                      className="mt-auto w-full rounded-xl"
                      disabled={!!busy}
                      onClick={() => void open(group)}
                    >
                      {busy === key
                        ? "Enabling…"
                        : enabled
                        ? "Browse provider"
                        : "Enable & browse"}
                      <ArrowUpRight className="ml-2 size-4" />
                    </Button>
                  </article>
                );
              })}
          </div>
        )}
        {pages > 1 && (
          <nav
            aria-label="Provider pages"
            className="mt-8 flex items-center justify-center gap-4"
          >
            <Button
              variant="outline"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              {current} / {pages}
            </span>
            <Button
              variant="outline"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </main>
      <MobileNav />
    </div>
  );
}
