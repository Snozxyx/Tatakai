import { useState } from "react";
import { Languages, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useMangaDownload } from "@/hooks/media/useMangaDownload";
import { toast } from "sonner";

export function TranslateChapterButton({
  anilistId,
  chapterKey,
  title,
  chapterLabel,
  provider,
  providerChapterId,
  chapterNumber,
}: {
  anilistId: number;
  chapterKey: string;
  title: string;
  chapterLabel?: string;
  provider?: string;
  providerChapterId?: string;
  chapterNumber?: number;
}) {
  const bridge = window.electron?.translate;
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { enqueueChapter } = useMangaDownload();
  const [busy, setBusy] = useState(false);
  if (!bridge || !anilistId || !chapterKey) return null;
  return (
    <Button
      variant="outline"
      size="icon"
      className="size-11 shrink-0 rounded-xl [&_svg]:size-5"
      aria-label={busy ? "Preparing translation" : "Translate chapter with Yomi"}
      aria-busy={busy}
      disabled={busy}
      title="Translate this downloaded chapter with Yomi"
      onClick={async () => {
        setBusy(true);
        try {
          const result = await bridge.importChapter({
            anilistId,
            chapterKey,
            chapterLabel,
            customRoot:
              localStorage.getItem("tatakai_download_path") || undefined,
            credit: {
              name:
                profile?.display_name ||
                profile?.username ||
                "Local translator",
              userId: user?.id || null,
            },
          });
          if (result.success) {
            navigate("/translate");
            return;
          }
          toast.info("Download this chapter to translate it.", {
            action: {
              label: "Download chapter",
              onClick: () => {
                void enqueueChapter(
                  { anilistId, title },
                  { chapterKey, provider, providerChapterId, chapterNumber }
                )
                  .then((result) => {
                    if (!result.ok)
                      toast.error(
                        "reason" in result
                          ? String(result.reason)
                          : "Could not start chapter download"
                      );
                    else
                      toast.info(
                        "Download queued. Choose the Yomi translation icon again when it finishes."
                      );
                  })
                  .catch((e) => toast.error(e.message));
              },
            },
          });
        } catch (e) {
          toast.error(
            e instanceof Error
              ? e.message
              : "Could not create translation project"
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <LoaderCircle className="size-5 motion-safe:animate-spin" />
      ) : (
        <Languages className="size-5" />
      )}
    </Button>
  );
}
