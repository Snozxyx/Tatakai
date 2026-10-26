import { useMotionPreference } from "@/hooks/ui/useMotionPreference";
import { Gift, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useThemeLaunchOffer } from "@/hooks/user/useProfileThemeClaims";

const LAUNCH_PREVIEWS = [
  {
    id: "uchiha",
    label: "Uchiha",
    image: "/assets/profile-themes/uchiha/itachi-rain-poster.webp",
  },
  {
    id: "sekaipop",
    label: "SekaiPop",
    image: "/assets/profile-themes/sekaipop/default-wallpaper.png",
  },
  {
    id: "gothic-empress",
    label: "Gothic Empress",
    image: "/assets/profile-themes/gothic-empress/empress-poster.jpg",
  },
  {
    id: "midnight-lofi",
    label: "Midnight Lo-Fi",
    image: "/assets/profile-themes/midnight-lofi/midnight-room.webp",
  },
  {
    id: "komorebi",
    label: "Komorebi",
    image: "/assets/profile-themes/komorebi/garden.webp",
  },
] as const;

export function ThemeLaunchOffer() {
  const { status, claim } = useThemeLaunchOffer();
  const offer = status.data;
  const reduced = useMotionPreference();
  return (
    <section
      className="theme-launch-offer"
      aria-label="Free theme launch offer"
    >
      <div
        className="theme-launch-slider"
        data-reduced-motion={reduced}
        role="region"
        aria-label="Preview all five themes. Hover or focus to pause."
        tabIndex={0}
      >
        <div className="theme-launch-track">
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className="theme-launch-slide-group"
              aria-hidden={copy === 1 ? true : undefined}
            >
              {LAUNCH_PREVIEWS.map((theme) => (
                <figure
                  key={theme.id}
                  className={`theme-launch-slide theme-launch-slide-${theme.id}`}
                >
                  <img src={theme.image} alt="" decoding="async" />
                  <figcaption>{theme.label}</figcaption>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="theme-launch-copy">
        <h4>
          <Gift size={19} />
          Every world. Yours to keep.
        </h4>
        <p>
          Claim all five custom themes free, forever: Uchiha, SekaiPop, Gothic
          Empress, Midnight Lo-Fi, and Komorebi. For the first 200 eligible
          accounts.
        </p>
        <span className="theme-launch-terms">
          For accounts without Premium Go, Pro, Ultra, Booster, or Admin access.
          One claim per account.
        </span>
        {offer && (
          <strong className="theme-launch-count" aria-live="polite">
            {offer.claimed
              ? "All five themes are permanently in your collection."
              : `${offer.remaining} of ${offer.limit} free collections left`}
          </strong>
        )}
        {status.isError ? (
          <div className="flex items-center gap-3">
            <p role="status">The offer is temporarily unavailable.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void status.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <Button
            disabled={
              !offer ||
              offer.claimed ||
              !offer.eligible ||
              offer.remaining === 0 ||
              claim.isPending
            }
            onClick={() =>
              claim.mutate(undefined, {
                onSuccess: () =>
                  toast.success(
                    "All five themes are yours forever. Choose a theme below to equip it."
                  ),
              })
            }
          >
            {claim.isPending ? (
              "Claiming your collection…"
            ) : !offer ? (
              "Checking availability…"
            ) : offer.claimed ? (
              <>
                <Check size={16} />
                Collection claimed
              </>
            ) : !offer.eligible ? (
              "Not eligible for this offer"
            ) : offer.remaining === 0 ? (
              "All 200 collections claimed"
            ) : (
              "Claim all 5 themes · Free"
            )}
          </Button>
        )}
        {claim.error && (
          <p role="alert" className="text-sm text-destructive">
            {claim.error.message}
          </p>
        )}
      </div>
    </section>
  );
}
