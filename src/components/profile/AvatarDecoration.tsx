import uiI18n from "@/lib/uiI18n";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
import { useId } from "react";
import { useMotionPreference } from "@/hooks/ui/useMotionPreference";
import {
  AVATAR_DECORATIONS,
  type AvatarDecorationKey,
} from "@/lib/profileCosmetics";

interface AvatarDecorationProps {
  decoration: AvatarDecorationKey;
}

/** Vector jewelry sits outside the portrait. Each instance owns its gradient IDs. */
export function AvatarDecoration({ decoration }: AvatarDecorationProps) {
  useUiTranslation();
  const id = useId().replace(/:/g, "");
  const reduced = useMotionPreference();
  const design = AVATAR_DECORATIONS.find((item) => item.key === decoration);
  if (!design || decoration === "none") return null;
  const ink = `url(#decoration-${id})`;
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      data-avatar-decoration={decoration}
      data-reduced-motion={reduced}
      className="avatar-decoration pointer-events-none absolute -left-[7%] -top-[7%] z-10 h-[114%] w-[114%] overflow-visible"
    >
      <defs>
        <linearGradient id={`decoration-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={design.colors[0]} />
          <stop offset="0.45" stopColor={design.colors[1]} />
          <stop offset="1" stopColor={design.colors[0]} />
        </linearGradient>
      </defs>
      <circle
        cx="60"
        cy="60"
        r="54"
        fill="none"
        stroke="#070910"
        strokeWidth="4"
        opacity="0.7"
      />
      <circle
        cx="60"
        cy="60"
        r="54"
        fill="none"
        stroke={ink}
        strokeWidth="1.5"
      />
      <circle
        cx="60"
        cy="60"
        r="56.5"
        fill="none"
        stroke={ink}
        strokeWidth="0.5"
        opacity="0.6"
      />
      <g fill={ink} stroke={ink} strokeWidth="0.6" strokeLinejoin="round">
        {decoration === "enso" && (
          <circle
            cx="60"
            cy="60"
            r="58"
            fill="none"
            strokeWidth="2.5"
            strokeDasharray="305 60"
            strokeLinecap="round"
            transform="rotate(-50 60 60)"
          />
        )}
        {decoration === "kumihimo" && (
          <>
            <circle
              cx="60"
              cy="60"
              r="58"
              fill="none"
              strokeWidth="2"
              strokeDasharray="3 4"
            />
            <path
              d="M46 112Q60 97 74 112Q60 125 46 112 M60 112L54 125M60 112L66 125"
              fill="none"
              strokeWidth="1.5"
            />
          </>
        )}
        {decoration === "kintsugi" && (
          <>
            <circle
              cx="60"
              cy="60"
              r="57"
              fill="none"
              strokeWidth="3"
              opacity=".35"
            />
            <path
              d="M26 9L30 17L23 22L25 30M30 17L40 19M106 39L99 45L107 53L101 61M28 108L34 100L30 94L39 90M34 100L44 104"
              fill="none"
              strokeWidth="2"
            />
          </>
        )}
        {decoration === "tsukimi" && (
          <>
            <path d="M62 -2A10 10 0 1 0 73 10A8 8 0 0 1 62 -2" />
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`rotate(${i * 12} 105 107)`}>
                <path d="M105 107Q115 90 110 71" fill="none" />
                <ellipse
                  cx="110"
                  cy="75"
                  rx="2"
                  ry="10"
                  transform="rotate(-15 110 75)"
                />
              </g>
            ))}
          </>
        )}
        {decoration === "mizuhiki" && (
          <>
            <path
              d="M60 110C28 87 26 121 49 116L71 104C94 91 96 122 60 110ZM60 110L49 125M60 110L71 125"
              fill="none"
              strokeWidth="2"
            />
            <circle cx="60" cy="3" r="3" />
          </>
        )}
        {decoration === "shizuku" && (
          <>
            {[20, 100, 180, 260].map((angle) => (
              <g key={angle} transform={`rotate(${angle} 60 60)`}>
                <path d="M60 -3Q51 8 60 11Q69 8 60 -3Z" />
                <circle cx="48" cy="5" r="1.5" />
              </g>
            ))}
          </>
        )}
        {decoration === "bamboo" && (
          <>
            {[false, true].map((mirror) => (
              <g
                key={String(mirror)}
                transform={mirror ? "translate(120 0) scale(-1 1)" : undefined}
              >
                <path
                  d="M12 94Q0 60 19 23M9 76L17 73M8 58L16 57M12 40L20 43"
                  fill="none"
                  strokeWidth="1.5"
                />
                {[35, 52, 72].map((y) => (
                  <path
                    key={y}
                    d={`M10 ${y}q-16 -10 -10 -19q14 2 10 19q16 -8 22 -3q-6 10 -22 3`}
                  />
                ))}
              </g>
            ))}
          </>
        )}
        {decoration === "momiji" && (
          <>
            {[
              [16, 24, 25],
              [108, 86, 165],
              [34, 108, 70],
            ].map(([x, y, r], i) => (
              <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
                <path d="M0 9L-3 4L-10 3L-6 -1L-8 -7L-3 -5L0 -12L3 -5L8 -7L6 -1L10 3L3 4Z" />
                <path d="M0 -7V14" fill="none" strokeWidth="1" />
              </g>
            ))}
          </>
        )}
        {decoration === "kitsune" && (
          <>
            <path
              d="M15 31L14 -2L41 11M79 11L106 -2L105 31"
              fill="none"
              strokeWidth="3"
            />
            <path d="M19 17L20 5L30 12M90 12L100 5L101 17" />
            <path
              d="M11 87L7 108M109 87L113 108"
              fill="none"
              strokeWidth="1.5"
            />
            <path d="M7 103L2 117L11 116ZM113 103L109 116L118 117Z" />
            <g transform="translate(60 116)">
              <Star size={4} />
            </g>
          </>
        )}
        {decoration === "pearl-tide" && (
          <>
            {Array.from({ length: 18 }, (_, i) => (
              <circle
                key={i}
                cx={60 + 57 * Math.cos((i * Math.PI) / 9)}
                cy={60 + 57 * Math.sin((i * Math.PI) / 9)}
                r={i % 3 === 0 ? 3 : 1.6}
              />
            ))}
            <path
              d="M37 111Q60 133 83 111M42 114Q60 129 78 114"
              fill="none"
              strokeWidth="1"
            />
          </>
        )}
        {decoration === "crimson-thorns" && (
          <>
            <path
              d="M22 109Q-6 73 11 33L9 14L24 23M98 109Q126 73 109 33L111 14L96 23"
              fill="none"
              strokeWidth="2"
            />
            {[false, true].map((m) => (
              <g
                key={String(m)}
                transform={m ? "translate(120 0) scale(-1 1)" : undefined}
              >
                <path d="M7 51L-1 40L10 44M6 72L-3 65L7 64M12 93L3 91L9 84" />
              </g>
            ))}
            <path d="M60 108L66 116L60 125L54 116Z" fill="#c65372" />
            <circle cx="60" cy="2" r="3" />
          </>
        )}
        {decoration === "celestial" && (
          <>
            <path d="M 59 0 A 10 10 0 1 0 70 12 A 8 8 0 0 1 59 0" />
            {[
              [-6, 0],
              [6, 0],
            ].map(([x], i) => (
              <g key={i} transform={`translate(${i ? 106 : 14} 88)`}>
                <Star size={4} />
                <circle cx={x} cy="-8" r="1" />
              </g>
            ))}
            <path
              d="M 22 18 L 30 12 L 37 10 M 90 12 L 100 21 L 107 30"
              fill="none"
              opacity="0.7"
            />
            <circle cx="22" cy="18" r="1.5" />
            <circle cx="100" cy="21" r="1.5" />
            <circle cx="107" cy="30" r="1" />
          </>
        )}
        {decoration === "sakura-wreath" && (
          <>
            <path
              d="M 8 76 Q -2 39 29 14 M 91 106 Q 119 91 114 53"
              fill="none"
              strokeWidth="1.2"
            />
            {[
              [13, 33, 6],
              [7, 57, 4],
              [25, 18, 4],
              [111, 73, 5],
              [105, 93, 6],
              [92, 104, 4],
            ].map(([x, y, size], i) => (
              <g key={i} transform={`translate(${x} ${y}) rotate(${i * 27})`}>
                <Flower size={size} />
              </g>
            ))}
            <path d="M 8 73 Q 1 66 4 60 Q 13 64 8 73 M 113 86 Q 121 83 120 75 Q 111 77 113 86" />
          </>
        )}
        {decoration === "imperial" && (
          <>
            <path d="M 43 8 L 40 0 L 51 6 L 60 -4 L 69 6 L 80 0 L 77 8 Z" />
            <path d="M 44 10 Q 60 16 76 10" fill="none" strokeWidth="1.5" />
            <path d="M 60 3 L 63 6 L 60 9 L 57 6 Z" fill="#fff8df" />
            {[-1, 1].map((side) => (
              <g
                key={side}
                transform={
                  side === 1 ? "translate(120 0) scale(-1 1)" : undefined
                }
              >
                <path d="M 15 90 Q 2 67 10 43" fill="none" />
                {[0, 1, 2, 3].map((i) => (
                  <path
                    key={i}
                    d={`M ${9 + i} ${
                      52 + i * 9
                    } q -9 -7 -8 -13 q 10 1 8 13 q 8 -7 13 -5 q -2 9 -13 5`}
                  />
                ))}
              </g>
            ))}
            <g transform="translate(60 115)">
              <Star size={4} />
            </g>
          </>
        )}
        {decoration === "crystal" && (
          <>
            {[0, 60, 120, 180, 240, 300].map((rotation, i) => (
              <g key={rotation} transform={`rotate(${rotation} 60 60)`}>
                <path d={`M 60 ${i % 2 ? 0 : -3} L 64 8 L 60 15 L 56 8 Z`} />
                <path
                  d="M 60 1 L 60 13 M 56 8 L 64 8"
                  stroke="#fff"
                  strokeWidth="0.4"
                  opacity="0.6"
                />
              </g>
            ))}
            <circle
              cx="60"
              cy="60"
              r="57"
              fill="none"
              strokeDasharray="2 5"
              opacity="0.8"
            />
          </>
        )}
        {decoration === "seraph" && (
          <>
            <ellipse
              cx="60"
              cy="2"
              rx="16"
              ry="4"
              fill="none"
              strokeWidth="1.5"
            />
            {[-1, 1].map((side) => (
              <g
                key={side}
                transform={
                  side === 1 ? "translate(120 0) scale(-1 1)" : undefined
                }
              >
                <path d="M 9 64 Q -10 62 -10 34 Q 0 41 11 44 Q -2 41 -9 25 Q 5 35 16 35 Q 3 28 0 14 Q 16 26 25 22 Q 12 24 9 64" />
                <path
                  d="M 4 48 Q 1 53 6 61 M 2 34 Q 8 40 13 42"
                  fill="none"
                  stroke="#fff8e9"
                  opacity="0.7"
                />
              </g>
            ))}
            <g transform="translate(60 115)">
              <Star size={4} />
            </g>
          </>
        )}
        {decoration === "lotus" && (
          <>
            <path d="M 60 119 Q 44 110 60 97 Q 76 110 60 119 M 60 119 Q 35 116 35 101 Q 51 102 60 119 M 60 119 Q 85 116 85 101 Q 69 102 60 119" />
            <path
              d="M 60 117 Q 25 119 22 103 Q 43 99 60 117 M 60 117 Q 95 119 98 103 Q 77 99 60 117"
              opacity="0.8"
            />
            <path d="M 13 80 Q 0 70 7 58 Q 19 66 13 80 M 107 80 Q 120 70 113 58 Q 101 66 107 80" />
            <g transform="translate(60 5)">
              <Star size={3} />
            </g>
          </>
        )}
        {decoration === "eclipse" && (
          <>
            <circle
              cx="60"
              cy="60"
              r="59"
              fill="none"
              strokeWidth="0.7"
              strokeDasharray="90 25 30 40"
            />
            <path d="M 96 10 A 11 11 0 1 0 109 23 A 9 9 0 0 1 96 10" />
            <g transform="translate(16 98)">
              <Star size={5} />
            </g>
            <circle cx="7" cy="82" r="1.8" />
            <circle cx="28" cy="109" r="1" />
          </>
        )}
        {decoration === "starlight" && (
          <>
            <path
              d="M 17 24 L 32 12 L 60 6 L 87 14 L 106 32 M 12 85 L 27 106 L 60 116 L 94 105 L 110 82"
              fill="none"
              strokeWidth="0.6"
              opacity="0.7"
            />
            {[
              [17, 24, 3],
              [32, 12, 2],
              [60, 6, 5],
              [87, 14, 2],
              [106, 32, 3],
              [12, 85, 2],
              [27, 106, 4],
              [60, 116, 3],
              [94, 105, 4],
              [110, 82, 2],
            ].map(([x, y, size], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                <Star size={size} />
              </g>
            ))}
          </>
        )}
      </g>
      <g
        className="avatar-decoration__sheen"
        fill="none"
        stroke={design.colors[1]}
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="60" cy="60" r="54" strokeDasharray="12 328" opacity="0.8" />
      </g>
    </svg>
  );
}

function Star({ size }: { size: number }) {
  useUiTranslation();
  return (
    <path
      d={`M 0 ${-size} Q ${size * 0.2} ${-size * 0.2} ${size} 0 Q ${
        size * 0.2
      } ${size * 0.2} 0 ${size} Q ${-size * 0.2} ${size * 0.2} ${-size} 0 Q ${
        -size * 0.2
      } ${-size * 0.2} 0 ${-size} Z`}
    />
  );
}

function Flower({ size }: { size: number }) {
  useUiTranslation();
  return (
    <>
      <g fillOpacity="0.9">
        {[0, 72, 144, 216, 288].map((rotation) => (
          <ellipse
            key={rotation}
            cx="0"
            cy={-size * 0.45}
            rx={size * 0.38}
            ry={size * 0.62}
            transform={`rotate(${rotation})`}
          />
        ))}
      </g>
      <circle r={size * 0.2} fill="#fff4dd" stroke="none" />
    </>
  );
}
