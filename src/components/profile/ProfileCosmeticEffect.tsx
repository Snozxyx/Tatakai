import uiI18n from "@/lib/uiI18n";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
import type { ReactNode } from "react";
import { useMotionPreference } from "@/hooks/ui/useMotionPreference";
import {
  PROFILE_NAMEPLATES,
  type ProfileNameplateKey,
  type ProfileCosmeticEffectKey,
} from "@/lib/profileCosmetics";

export function ProfileNameplate({
  nameplate,
  children,
}: {
  nameplate: ProfileNameplateKey;
  children: ReactNode;
}) {
  useUiTranslation();
  const design = PROFILE_NAMEPLATES.find((item) => item.key === nameplate);
  if (!design || nameplate === "none") return <>{children}</>;
  return (
    <span
      data-profile-nameplate={nameplate}
      className="relative inline-flex max-w-full items-center gap-2 rounded-lg px-3 py-1.5"
      style={{
        background: `linear-gradient(110deg, ${design.colors[0]}, ${design.colors[1]})`,
        color: design.accent,
        boxShadow: `inset 0 0 0 1px ${design.accent}33`,
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 shrink-0"
        fill="currentColor"
      >
        {nameplate === "hinoki" ? (
          <path d="M8 0L2 7H5L1 12H7V16H9V12H15L11 7H14Z" />
        ) : nameplate === "seigaiha" ? (
          <path
            d="M0 13Q8 -2 16 13M2 15Q8 3 14 15M5 15Q8 9 11 15"
            fill="none"
            stroke="currentColor"
          />
        ) : nameplate === "akari" ? (
          <path d="M5 1H11V3Q16 8 11 13H5Q0 8 5 3ZM4 14H12V16H4Z" />
        ) : nameplate === "momiji-script" ? (
          <path d="M8 0L10 5L15 3L13 8L16 11L10 12L8 16L6 12L0 11L3 8L1 3L6 5Z" />
        ) : nameplate === "pearl" ? (
          <>
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" />
            <circle cx="8" cy="8" r="3" />
          </>
        ) : nameplate === "obsidian" ? (
          <path d="M1 3L5 6L8 0L11 6L15 3L13 13H3ZM4 14H12V16H4Z" />
        ) : nameplate === "aoi" ? (
          <path d="M8 15Q-5 4 5 2L8 6L11 2Q21 4 8 15Z" />
        ) : nameplate === "vermillion" ? (
          <path
            d="M1 1H15V15H1ZM4 4V12H6V9H10V12H12V4H10V7H6V4Z"
            fillRule="evenodd"
          />
        ) : nameplate === "sumi" ? (
          <path d="M3 3h10v10H3zM5 5v6h6V5z" fillRule="evenodd" />
        ) : nameplate === "matcha" ? (
          <path d="M14 2Q2 2 2 9Q2 15 8 13Q14 11 14 2Z" />
        ) : nameplate === "sakura-letter" ? (
          <path d="M8 7Q0 0 1 7Q0 14 8 10Q16 14 15 7Q16 0 8 7Z" />
        ) : nameplate === "yoru" ? (
          <path d="M10 1A7 7 0 1 0 15 11A7 7 0 0 1 10 1Z" />
        ) : nameplate === "honey-silk" ? (
          <path
            d="M8 1L14 4V12L8 15L2 12V4ZM8 4L5 6V10L8 12L11 10V6Z"
            fillRule="evenodd"
          />
        ) : nameplate === "wisteria" ? (
          <path d="M8 0Q2 4 5 7Q0 10 5 12Q4 16 8 16Q12 16 11 12Q16 10 11 7Q14 4 8 0Z" />
        ) : (
          <path d="M8 0 10 6 16 8 10 10 8 16 6 10 0 8 6 6Z" />
        )}
      </svg>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

const EFFECT_COLORS = {
  constellation: "#c5ddff",
  blossom: "#ffc1dd",
  spirit: "#f4ca8a",
  hologram: "#b7eee6",
  rainfall: "#b9dcee",
  firefly: "#e6edac",
  ginkgo: "#f4d687",
  "aurora-silk": "#bcebdc",
  "crimson-petals": "#f5a5b5",
  "moon-ripple": "#c7dbff",
};

/** An authored entrance at the perimeter; it settles so the portrait and copy stay clear. */
export function ProfileCosmeticEffect({
  effect,
  animated = true,
}: {
  effect: ProfileCosmeticEffectKey;
  animated?: boolean;
}) {
  useUiTranslation();
  const reduced = useMotionPreference();
  if (effect === "none") return null;
  const color = EFFECT_COLORS[effect];
  return (
    <div
      data-profile-cosmetic={effect}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[inherit]"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 0% 0%, ${color}14, transparent 32%), radial-gradient(ellipse at 100% 100%, ${color}12, transparent 32%)`,
          boxShadow: `inset 0 0 0 1px ${color}24`,
        }}
      />
      {Array.from({ length: 8 }, (_, i) => {
        const side = i % 2 === 0;
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className="absolute h-5 w-5"
            style={{
              left: side ? `${2 + (i % 3)}%` : undefined,
              right: !side ? `${2 + (i % 3)}%` : undefined,
              top: `${8 + i * 11}%`,
              color,
              opacity: 0.65,
              animation:
                animated && !reduced
                  ? `profile-cosmetic-arrive 2.4s cubic-bezier(0.23, 1, 0.32, 1) ${
                      i * 0.08
                    }s both`
                  : undefined,
            }}
          >
            {effect === "constellation" && (
              <path
                fill="currentColor"
                d="M12 1 14 9 22 12 14 14 12 22 9 14 1 12 9 9Z"
              />
            )}
            {effect === "blossom" && (
              <g fill="currentColor">
                {[0, 72, 144, 216, 288].map((rotation) => (
                  <ellipse
                    key={rotation}
                    cx="12"
                    cy="7"
                    rx="3.5"
                    ry="6"
                    transform={`rotate(${rotation} 12 12)`}
                  />
                ))}
                <circle cx="12" cy="12" r="2" fill="#fff2d7" />
              </g>
            )}
            {effect === "spirit" && (
              <path
                fill="currentColor"
                d="M12 1Q22 11 18 18Q12 24 6 18Q2 12 9 7Q7 16 12 18Q17 16 12 1Z"
              />
            )}
            {effect === "rainfall" && (
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              >
                <path d="M7 2L4 12M16 7L12 21M21 1L18 10" />
              </g>
            )}
            {effect === "firefly" && (
              <g fill="currentColor">
                <circle cx="12" cy="12" r="7" opacity=".1" />
                <circle cx="12" cy="12" r="3" opacity=".35" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="4" cy="5" r=".8" />
              </g>
            )}
            {effect === "ginkgo" && (
              <g fill="currentColor">
                <path
                  d="M12 17Q-3 13 3 2L10 6L12 3L14 6L21 2Q27 13 12 17Z"
                  opacity=".75"
                />
                <path d="M12 15L13 23" fill="none" stroke="currentColor" />
              </g>
            )}
            {effect === "aurora-silk" && (
              <g fill="none" stroke="currentColor" strokeLinecap="round">
                <path
                  d="M1 17Q9 0 23 7M1 21Q9 4 23 11"
                  strokeWidth="2"
                  opacity=".5"
                />
                <path d="M1 13Q9 -4 23 3" strokeWidth=".6" />
              </g>
            )}
            {effect === "crimson-petals" && (
              <g fill="currentColor">
                <path d="M3 3Q22 1 16 15Q4 19 3 3Z" />
                <path d="M17 18Q24 12 22 23Q17 24 17 18Z" opacity=".6" />
              </g>
            )}
            {effect === "moon-ripple" && (
              <g fill="none" stroke="currentColor" strokeWidth=".8">
                <ellipse cx="12" cy="13" rx="10" ry="4" />
                <ellipse cx="12" cy="13" rx="6" ry="2" />
                <path
                  d="M12 2Q8 8 12 9Q16 8 12 2Z"
                  fill="currentColor"
                  stroke="none"
                />
              </g>
            )}
            {effect === "hologram" && (
              <g stroke="currentColor" fill="none">
                <path d="M12 1 22 12 12 23 2 12Z M12 1V23 M2 12H22" />
                <path d="M12 6 17 12 12 18 7 12Z" />
              </g>
            )}
          </svg>
        );
      })}
    </div>
  );
}
