import { X, ArrowUpRight } from "lucide-react";
import type { ThemePreviewProps } from "../types";
import { CosmeticName } from "@/components/profile/IdentityCosmetics";
import "./komorebi.css";
export default function KomorebiPreview(p: ThemePreviewProps) {
  return (
    <section className="km-preview" aria-label={`${p.name}'s profile`}>
      <img src="/assets/profile-themes/komorebi/garden.webp" alt="" />
      <button
        type="button"
        className="km-preview-close"
        onClick={p.onClose}
        aria-label="Close profile"
      >
        <X size={18} />
      </button>
      <div>
        <h2>
          <CosmeticName userId={p.userId}>{p.name}</CosmeticName>
        </h2>
        <p>@{p.username}</p>
        <p>{p.privateProfile ? "Private profile" : p.bio}</p>
        <span>{p.followers ?? 0} followers</span>
        {p.canViewHistory && <span> · {p.episodes ?? 0} episodes</span>}
        <button type="button" className="km-follow" onClick={p.onOpen}>
          View profile
          <ArrowUpRight size={16} />
        </button>
        {p.canFollow && (
          <button type="button" disabled={p.followPending} onClick={p.onFollow}>
            {p.isFollowing ? "Following" : "Follow"}
          </button>
        )}
        {p.moderation}
      </div>
    </section>
  );
}
