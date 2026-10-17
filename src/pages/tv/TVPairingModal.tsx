import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createPairing,
  pairingAPI,
  receivePairing,
  importTransfer,
  type TransferPayload,
  type SealedTransfer,
} from "@/core/tv/pairingService";
export function TVPairingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const [pair, setPair] = useState<Awaited<ReturnType<typeof createPairing>>>();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let current: typeof pair;
    let imported: TransferPayload | undefined;
    let authenticated = false;
    setPair(undefined);
    setError("");
    setMessage("Creating a secure connection…");
    async function poll() {
      if (!current || abort.signal.aborted) return;
      if (Date.now() >= Date.parse(current.request.expiresAt)) {
        setError("Code expired. Generate a new code.");
        return;
      }
      try {
        const result = await pairingAPI<{
          status: string;
          payload?: { login: string; transfer: SealedTransfer };
        }>(
          "poll",
          { id: current.request.id, pollSecret: current.request.pollSecret },
          false,
          abort.signal
        );
        if (result.status === "approved" && result.payload) {
          if (!authenticated) {
            imported = await receivePairing(current.privateKey, result.payload);
            authenticated = true;
          }
          const failures = await importTransfer(imported!);
          if (failures.length) {
            setMessage(
              `Connected. Some imports failed: ${failures.join(
                ", "
              )}. Retrying…`
            );
            timer = setTimeout(poll, 10000);
            return;
          }
          await pairingAPI("acknowledge", {
            id: current.request.id,
            pollSecret: current.request.pollSecret,
          });
          setMessage(
            "Your TV is connected. Your library will sync automatically."
          );
          setPair(undefined);
          return;
        }
        if (["cancelled", "consumed"].includes(result.status)) {
          setError("Pairing is no longer available. Generate a new code.");
          return;
        }
        setError("");
        setMessage(
          "Approve on your phone, then compare the confirmation code."
        );
      } catch (e) {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Connection interrupted. Retrying…"
          );
      }
      if (!abort.signal.aborted) timer = setTimeout(poll, 3000);
    }
    void createPairing(abort.signal)
      .then((result) => {
        current = result;
        if (!abort.signal.aborted) {
          setPair(result);
          void poll();
        } else void pairingAPI("cancel", result.request).catch(() => undefined);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      abort.abort();
      clearTimeout(timer);
      if (current)
        void pairingAPI("cancel", current.request).catch(() => undefined);
    };
  }, [open, retry]);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="tv-dialog">
        <DialogHeader>
          <DialogTitle>Bring your Tatakai to the big screen</DialogTitle>
        </DialogHeader>
        <p role="status">{message}</p>
        {pair && (
          <div className="tv-pair-code">
            <QRCodeSVG
              value={`https://tatakai.me/link?pin=${pair.request.pin}`}
              size={250}
              marginSize={4}
            />
            <div>
              <p>Open tatakai.me/link</p>
              <strong>{pair.request.pin}</strong>
              <p>Compare: {pair.request.phrase}</p>
              <p>Expires in five minutes</p>
            </div>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <button onClick={() => setRetry((n) => n + 1)}>
          Generate a new code
        </button>
        <button onClick={onClose}>Close</button>
      </DialogContent>
    </Dialog>
  );
}
