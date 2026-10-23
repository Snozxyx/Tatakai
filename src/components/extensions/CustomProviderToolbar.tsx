import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Settings2 } from "lucide-react";
import { useCustomProviderGroups } from "@/hooks/api/useCustomSource";
import {
  customProviderKey,
  customSourceBase,
  sourceLanguage,
} from "@/core/content/custom-source-model";
import type { CustomSourceEntry } from "@/core/content/custom-source-runtime";
import {
  compatibilityRequest,
  type CompatibilitySource,
  type CompatibilityStatus,
} from "@/core/extensions/compatibility/client";
import { CompatibilitySettings } from "./CompatibilitySettings";
import { ExtensionLogo } from "./ExtensionLogo";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function CustomProviderToolbar({
  source,
  title,
  compact = false,
}: {
  source?: CustomSourceEntry;
  title?: string;
  compact?: boolean;
}) {
  const { data: groups } = useCustomProviderGroups(),
    navigate = useNavigate(),
    client = useQueryClient();
  const [settings, setSettings] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const key = source ? customProviderKey(source) : "";
  const group = groups.find((item) => customProviderKey(item) === key);
  const ecosystem = source?.namespace.replace("compat-", "");
  const nativeSettings = ["mihon", "aniyomi", "cloudstream"].includes(
    ecosystem || ""
  );
  const details = useQuery({
    queryKey: ["custom-source-settings", source?.namespace, source?.id],
    enabled: !!source && settings && nativeSettings,
    retry: false,
    queryFn: async () => {
      const [sources, status] = await Promise.all([
        compatibilityRequest<CompatibilitySource[]>({
          op: "sources",
          ecosystem,
        }),
        compatibilityRequest<CompatibilityStatus>({ op: "status" }),
      ]);
      return {
        source: sources.find((item) => item.id === source!.id && item.enabled),
        authentication:
          status.runtimes.find((item) => item.ecosystem === ecosystem)
            ?.authentication === true,
      };
    },
  });
  function openVariant(variant: CustomSourceEntry) {
    setSettings(false);
    if (menu.current) menu.current.open = false;
    navigate(
      customSourceBase(variant) +
        (title && variant.kind === source?.kind
          ? `?q=${encodeURIComponent(title)}`
          : "")
    );
  }
  const controls = (
    <div
      className="flex min-w-0 flex-wrap items-center gap-3"
      data-custom-provider-toolbar
    >
      <ExtensionLogo
        name={source?.name || "Provider"}
        src={source?.icon}
        className="size-10"
      />
      {source && groups.length > 0 && (
        <Select
          value={key}
          onValueChange={(value) => {
            const selected = groups.find(
              (item) => customProviderKey(item) === value
            );
            if (selected) openVariant(selected);
          }}
        >
          <SelectTrigger
            aria-label="Provider"
            className="w-full min-w-0 sm:w-64"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {groups.map((item) => (
                <SelectItem
                  key={customProviderKey(item)}
                  value={customProviderKey(item)}
                >
                  {item.name} · {item.kind === "read" ? "Read" : "Watch"}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
      {source && group && group.variants.length > 1 ? (
        <Select
          value={source.id}
          onValueChange={(value) => {
            const variant = group.variants.find((item) => item.id === value);
            if (variant) openVariant(variant);
          }}
        >
          <SelectTrigger
            aria-label="Provider language"
            className="w-full sm:w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {group.variants.map((item) => (
                <SelectItem value={item.id} key={item.id}>
                  {sourceLanguage(item.language)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        source?.language && (
          <span className="text-sm text-muted-foreground">
            {sourceLanguage(source.language)}
          </span>
        )
      )}
      {nativeSettings && (
        <Button
          variant="outline"
          onClick={() => setSettings(true)}
          disabled={settings}
        >
          <Settings2 data-icon="inline-start" />
          Source settings
        </Button>
      )}
      {settings && details.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading source settings…
        </p>
      )}
      {settings &&
        (details.isError || (details.isSuccess && !details.data.source)) && (
          <Alert variant="destructive">
            <AlertDescription>
              {details.error?.message || "Source is no longer available."}{" "}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettings(false)}
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}
      {settings && details.data?.source && (
        <CompatibilitySettings
          key={details.data.source.id}
          source={details.data.source}
          authentication={details.data.authentication}
          onClose={() => {
            setSettings(false);
            void client.invalidateQueries({
              queryKey: ["custom", source?.namespace, source?.id],
            });
          }}
        />
      )}
    </div>
  );
  return compact ? (
    <details ref={menu} className="relative w-fit max-w-full">
      <summary className="flex min-h-11 max-w-full cursor-pointer list-none items-center gap-3 rounded-xl text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ExtensionLogo
          name={source?.name || "Provider"}
          src={source?.icon}
          className="size-9"
        />
        <span className="min-w-0">
          <span className="block max-w-48 truncate text-foreground">
            {source?.name || "Provider"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {sourceLanguage(source?.language)}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </summary>
      <div className="absolute left-0 top-full z-50 mt-2 w-[min(32rem,calc(100vw-4rem))] rounded-2xl border border-border bg-background p-4 shadow-xl">
        {controls}
      </div>
    </details>
  ) : (
    controls
  );
}
