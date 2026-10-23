import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/core/db/tatakai-db";
import { resolveApiV3Base } from "@/lib/api/backendOrigin";
import {
  readCustomCatalog,
  trackedCustomEntry,
} from "@/core/content/custom-catalog";
import type { useCustomCatalog } from "./useCustomCatalog";
import type { ExtensionLibraryItem } from "@/core/extensions/compatibility/library";

// Serialize across player/reader/info views so late responses cannot lower progress.
const queues = new Map<string, Promise<void>>();
export function useCustomTracker(
  catalog: ReturnType<typeof useCustomCatalog>,
  entries: { id: string; number?: number }[],
  row?: ExtensionLibraryItem
) {
  const { user, profile } = useAuth();
  const [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const link = catalog.link;
  const number = link
    ? Math.max(
        0,
        ...Object.values(row?.entries || {})
          .filter((entry) => entry.completed)
          .map((entry) => trackedCustomEntry(link, entries, entry.id) || 0)
      )
    : 0;
  const connected = !!(
    profile?.anilist_access_token || profile?.mal_access_token
  );
  useEffect(() => {
    setError("");
    if (
      !user ||
      !connected ||
      !link?.syncEnabled ||
      !link.media.anilistId ||
      !number
    )
      return;
    let disposed = false;
    const media = link.media;
    const key = `custom-tracker:${user.id}:${media.kind}:${media.anilistId}`;
    const task = (queues.get(key) || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (disposed) return;
        const active = await readCustomCatalog(user.id, catalog.identity);
        if (
          !active?.link?.syncEnabled ||
          active.link.media.anilistId !== media.anilistId
        )
          return;
        const previous = await db.kv.get(key);
        const highWater = previous
          ? Number(JSON.parse(previous.value).progress) || 0
          : 0;
        if (number <= highWater) return;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token)
          throw Error(
            "Sign in to sync extension progress. Your local progress is saved."
          );
        if (disposed) return;
        const total = media.kind === "anime" ? media.episodes : media.chapters;
        const timeout = new AbortController(),
          timer = setTimeout(() => timeout.abort(), 30000);
        try {
          const response = await fetch(
            `${resolveApiV3Base()}/sync/extension-progress`,
            {
              method: "POST",
              signal: timeout.signal,
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                mediaKind: media.kind,
                type: media.kind === "anime" ? "anime" : "manga",
                anilistId: media.anilistId,
                ...(media.malId ? { malId: media.malId } : {}),
                status:
                  total && number === total
                    ? "completed"
                    : media.kind === "anime"
                    ? "watching"
                    : "reading",
                progress: number,
              }),
            }
          );
          if (!response.ok)
            throw Error(
              `Tracker sync failed (${response.status}). Your local progress is saved.`
            );
          const result = await response.json();
          if (result.success === false || result.error)
            throw Error(
              "Tracker rejected the progress update. Your local progress is saved."
            );
          const trackers = result.data?.trackers;
          if (!trackers)
            throw Error(
              "This server does not yet support verified extension tracking. Your local progress is saved."
            );
          const outcomes = Object.values(trackers) as {
            status: string;
            message?: string;
          }[];
          if (outcomes.some((outcome) => outcome.status === "error"))
            throw Error(
              outcomes.find((outcome) => outcome.status === "error")?.message ||
                "Tracker sync failed"
            );
          if (
            !outcomes.some(
              (outcome) =>
                outcome.status === "updated" || outcome.status === "unchanged"
            )
          )
            throw Error(
              "No connected tracker supports this catalogue title. Your local progress is saved."
            );
          await db.kv.put({
            key,
            value: JSON.stringify({ progress: number }),
            createdAt: new Date().toISOString(),
          });
        } finally {
          clearTimeout(timer);
        }
      });
    queues.set(key, task);
    void task
      .catch((error) => {
        if (!disposed)
          setError(
            error instanceof Error
              ? error.message
              : "Could not sync tracker progress"
          );
      })
      .finally(() => {
        if (queues.get(key) === task) queues.delete(key);
      });
    return () => {
      disposed = true;
    };
  }, [
    user?.id,
    connected,
    link?.media.anilistId,
    link?.media.kind,
    link?.syncEnabled,
    catalog.identity.namespace,
    catalog.identity.sourceId,
    catalog.identity.id,
    number,
    revision,
  ]);
  return { error, retry: () => setRevision((value) => value + 1) };
}
