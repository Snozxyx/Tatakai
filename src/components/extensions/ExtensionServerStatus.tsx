import { EXTENSION_PORTAL_URL, fetchPublishedServers, fetchStoreExtension, type StoreExtension } from "@/core/extensions/store-api";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { isNative } from "@/lib/platform/platform";

function PublishedServers() {
  const navigate = useNavigate();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const directory = useQuery({
    queryKey: ['published-extension-servers'],
    queryFn: ({ signal }) => fetchPublishedServers(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  async function connect(server: StoreExtension) {
    setConnecting(server.id); setError('');
    try {
      const detail = await fetchStoreExtension(server.id);
      const url = new URL(detail?.sourceUrl || '');
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('This server has an invalid connection address.');
      navigate('/extensionserver/' + encodeURIComponent(url.origin));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not open this server. Try again.');
    } finally { setConnecting(null); }
  }
  return <div className="flex flex-col gap-3">
    <p className="text-sm text-muted-foreground">Connect a community server to use its sources.</p>
    {directory.isPending && <p role="status" className="text-sm text-muted-foreground">Loading published servers…</p>}
    {directory.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><span>Could not load published servers.</span><Button variant="outline" size="sm" disabled={directory.isFetching} onClick={() => void directory.refetch()}>Try again</Button></div>}
    {directory.data?.length === 0 && <p className="text-sm text-muted-foreground">No community servers are published yet. You can add a server by URL below.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="divide-y divide-border">
      {directory.data?.map(server => <div key={server.id} className="flex min-w-0 flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ExtensionLogo name={server.name} src={server.icon} />
          <div className="min-w-0"><h3 className="break-words font-semibold">{server.name}</h3><p className="break-words text-sm text-muted-foreground">{server.description}</p></div>
        </div>
        <Button variant="outline" disabled={connecting !== null} aria-label={`Connect to ${server.name}`} onClick={() => void connect(server)}>{connecting === server.id ? 'Opening…' : 'Connect'}</Button>
      </div>)}
    </div>
  </div>;
}

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
            {servers.length
              ? 'Your connected community-hosted sources. Health refreshes every minute; running time resets on server restart.'
              : 'Browse published community servers and connect to use their sources.'}
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
        ) : !isNative() ? <PublishedServers /> : (
          <p className="text-sm text-muted-foreground">
            No community servers connected. Add a server in Extension Servers
            below.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
