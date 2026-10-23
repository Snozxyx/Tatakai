import { EXTENSION_PORTAL_URL } from "@/core/extensions/store-api";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Server, Settings2, RefreshCw } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExtensionLogo } from "./ExtensionLogo";
import {
  listServers,
  serverRequest,
  type ServerConnection,
} from "@/core/extensions/server/client";
import { EXTENSION_INSTALLED_EVENT } from "@/core/extensions/ecosystems";
import { formatServiceDuration } from "@/lib/betterStackStatus";
import { useSettingsModal } from "@/contexts/SettingsModalContext";

function CommunityServer({ server }: { server: ServerConnection }) {
  const health = useQuery({
    queryKey: [
      "extension-server-health",
      server.id,
      server.url,
      server.enabled,
    ],
    enabled: server.enabled,
    queryFn: ({ signal }) =>
      serverRequest<{
        name: string;
        logoUrl?: string;
        uptimeSeconds?: number;
        protocolVersion: number;
        serverId: string;
      }>(server, "/health", undefined, signal),
    staleTime: 30000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    retry: 0,
  });
  const compatible =
    health.data?.protocolVersion === 1 &&
    health.data.serverId === server.serverId;
  const state = !server.enabled
    ? "Disabled"
    : health.isFetching && !health.data
    ? "Checking"
    : health.isError
    ? "Unreachable"
    : compatible
    ? "Online"
    : health.data
    ? "Incompatible"
    : "Unknown";
  const name = health.data?.name || server.name;
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4">
      <div className="flex min-w-0 items-center gap-3">
        <ExtensionLogo
          name={name}
          src={
            health.data?.logoUrl ||
            server.logoUrl ||
            `${server.url}/favicon.ico`
          }
        />
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {new URL(server.url).host}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant={state === "Online" ? "secondary" : "outline"}>
          {state}
        </Badge>
        <span className="text-muted-foreground">
          Running for{" "}
          <strong className="font-medium text-foreground">
            {compatible && !health.isError && server.enabled
              ? formatServiceDuration(health.data?.uptimeSeconds)
              : "Unavailable"}
          </strong>
        </span>
        <Button
          size="icon"
          variant="ghost"
          disabled={!server.enabled || health.isFetching}
          aria-label={`Refresh ${name} status`}
          onClick={() => health.refetch()}
        >
          <RefreshCw className={health.isFetching ? "animate-spin" : ""} />
        </Button>
      </div>
    </div>
  );
}
export function ExtensionServerStatus() {
  const [servers, setServers] = useState(listServers);
  const { openSettings } = useSettingsModal();
  useEffect(() => {
    const refresh = () => setServers(listServers());
    window.addEventListener(EXTENSION_INSTALLED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EXTENSION_INSTALLED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return (
    <Card className="mt-6">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-5" />
            Community extension servers
          </CardTitle>
          <CardDescription>
            Your connected community-hosted sources. Health refreshes every
            minute; running time resets on server restart.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={() => openSettings("extensions")}>
          <Settings2 />
          Manage servers
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button asChild variant="link" className="self-start px-0">
          <a
            href={`${EXTENSION_PORTAL_URL}/extensions?ecosystem=tatakai-server`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Browse published community servers
          </a>
        </Button>
        {servers.length ? (
          servers.map((server) => (
            <CommunityServer key={server.id} server={server} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No community servers connected. Add a server in Extension Servers
            below.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
