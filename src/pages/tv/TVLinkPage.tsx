import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  pairingAPI,
  sealTransfer,
  type PairingLookup,
  type TransferPayload,
} from "@/core/tv/pairingService";
import { secretStorage } from "@/core/tv/secretStorage";
import { db } from "@/core/db/tatakai-db";
import { debridOrchestrator } from "@/core/providers/debrid-orchestrator";
export default function TVLinkPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [pin, setPin] = useState(params.get("pin") || ""),
    [lookup, setLookup] = useState<PairingLookup>();
  const [confirmed, setConfirmed] = useState(false),
    [providers, setProviders] = useState(false),
    [playlists, setPlaylists] = useState(false),
    [extensions, setExtensions] = useState(false);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to link TV");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-xl p-8 flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Link your TV</h1>
      {!user ? (
        <>
          <p>Sign in to approve a separate login for your TV.</p>
          <Link to={`/auth?returnTo=${encodeURIComponent(`/link?pin=${pin}`)}`}>
            Sign in
          </Link>
        </>
      ) : (
        <>
          <label>
            Six-digit code
            <input
              className="w-full border p-3"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ""));
                setLookup(undefined);
                setConfirmed(false);
              }}
            />
          </label>
          <button
            disabled={busy || pin.length !== 6}
            onClick={() =>
              void run(async () =>
                setLookup(await pairingAPI("lookup", { pin }, true))
              )
            }
          >
            Find TV
          </button>
          {lookup && (
            <>
              <p>
                Confirm the TV displays <strong>{lookup.phrase}</strong>.
              </p>
              <label>
                <ThemedCheckbox
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                The codes match
              </label>
              <p>
                Your account library and history sync after login. Choose
                additional data to copy:
              </p>
              <label>
                <ThemedCheckbox
                  type="checkbox"
                  checked={providers}
                  onChange={(e) => setProviders(e.target.checked)}
                />{" "}
                Stored provider credentials
              </label>
              <label>
                <ThemedCheckbox
                  type="checkbox"
                  checked={playlists}
                  onChange={(e) => setPlaylists(e.target.checked)}
                />{" "}
                IPTV playlists
              </label>
              <label>
                <ThemedCheckbox
                  type="checkbox"
                  checked={extensions}
                  onChange={(e) => setExtensions(e.target.checked)}
                />{" "}
                Extension installation list
              </label>
              <button
                disabled={!confirmed || busy}
                onClick={() =>
                  void run(async () => {
                    const payload: TransferPayload = { version: 1 };
                    if (providers) {
                      payload.credentials = {};
                      for (const provider of [
                        "anilist",
                        "mal",
                        "real-debrid",
                        "torbox",
                      ]) {
                        const value = await secretStorage.get(
                          `provider:${provider}`
                        );
                        if (value) payload.credentials[provider] = value;
                      }
                      for (const account of debridOrchestrator.getAccounts())
                        if (
                          account.provider === "realdebrid" ||
                          account.provider === "torbox"
                        )
                          payload.credentials[
                            account.provider === "realdebrid"
                              ? "real-debrid"
                              : "torbox"
                          ] = account.apiKey;
                    }
                    if (playlists) {
                      payload.playlists = [];
                      for (const playlist of await db.iptvPlaylists.toArray()) {
                        const value = await secretStorage.get(
                          playlist.credentialRef
                        );
                        if (value)
                          payload.playlists.push({
                            name: playlist.name,
                            source: JSON.parse(value),
                          });
                      }
                    }
                    if (extensions) {
                      const list = [
                        ...(await db.extensions.toArray()),
                        ...(await db.mobileExtensionBundles.toArray()),
                      ];
                      const catalog = await (
                        await import("@/core/extensions/marketplace-client")
                      ).fetchMarketplaceExtensions();
                      payload.extensions = catalog
                        .filter((item) =>
                          list.some((installed) => installed.id === item.id)
                        )
                        .map((item) => ({ id: item.id, url: item.mainUrl }));
                    }
                    await pairingAPI(
                      "approve",
                      {
                        id: lookup.id,
                        phrase: lookup.phrase,
                        payload: await sealTransfer(lookup.publicKey, payload),
                      },
                      true
                    );
                    setLookup(undefined);
                    setMessage("Approved. Complete the connection on your TV.");
                  })
                }
              >
                Approve TV connection
              </button>
            </>
          )}
        </>
      )}
      <p role="status">{busy ? "Connecting…" : message}</p>
    </main>
  );
}
