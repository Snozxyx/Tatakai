import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import { coordForCountry, flagEmoji, projectCountry } from '@/utils/countryCoords';

export interface WorldMapDatum {
  name: string;
  value: number;
}

interface Props {
  data: WorldMapDatum[];
  /** Sessions/visitors with no country attached. */
  unknownCount?: number;
  maxListRows?: number;
}

// Simplified continent silhouettes ([lon, lat] rings) — stylised, not survey
// grade, but recognisable at dashboard scale on a 1000×500 equirectangular grid.
const CONTINENTS: Array<Array<[number, number]>> = [
  // North America + Central America
  [[-168, 66], [-158, 71], [-140, 70], [-125, 72], [-110, 73], [-95, 72], [-85, 69], [-75, 72], [-65, 62], [-60, 55], [-55, 47], [-65, 45], [-70, 44], [-74, 40], [-76, 35], [-80, 32], [-81, 26], [-84, 30], [-90, 29], [-97, 26], [-97, 22], [-94, 18], [-87, 16], [-83, 15], [-79, 9], [-83, 8], [-90, 14], [-97, 16], [-105, 20], [-110, 24], [-114, 29], [-120, 34], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-152, 60], [-162, 60]],
  // Greenland
  [[-58, 64], [-52, 60], [-44, 60], [-40, 65], [-45, 70], [-55, 75], [-60, 76], [-62, 72], [-60, 68]],
  // South America
  [[-79, 9], [-71, 11], [-62, 9], [-52, 5], [-44, -3], [-38, -8], [-40, -20], [-48, -28], [-55, -35], [-62, -42], [-65, -50], [-68, -55], [-72, -52], [-73, -42], [-71, -30], [-70, -20], [-75, -15], [-79, -8], [-81, -2], [-80, 4]],
  // Europe
  [[-9, 37], [-9, 43], [-2, 44], [-1, 46], [-4, 48], [0, 50], [3, 51], [8, 54], [8, 57], [11, 59], [18, 60], [22, 65], [28, 71], [38, 68], [44, 67], [40, 62], [32, 60], [28, 58], [24, 56], [20, 54], [16, 50], [14, 46], [19, 44], [15, 40], [8, 38], [0, 38], [-6, 36]],
  // Africa
  [[-6, 35], [10, 37], [20, 33], [32, 31], [43, 12], [51, 12], [48, 4], [42, -4], [40, -12], [36, -22], [32, -29], [26, -34], [19, -35], [15, -28], [12, -18], [13, -8], [9, 0], [0, 5], [-8, 5], [-13, 8], [-17, 15], [-16, 22], [-10, 31]],
  // Asia
  [[44, 67], [55, 68], [70, 72], [90, 75], [110, 74], [130, 72], [150, 70], [170, 68], [179, 65], [170, 60], [162, 58], [156, 52], [142, 50], [140, 42], [128, 38], [122, 32], [120, 24], [110, 18], [108, 12], [104, 8], [100, 8], [98, 12], [94, 17], [90, 22], [86, 20], [80, 14], [77, 8], [74, 14], [70, 22], [62, 25], [56, 26], [52, 28], [48, 30], [44, 32], [40, 37], [36, 42], [40, 48], [44, 55], [42, 62]],
  // SE Asia islands (Sumatra / Borneo / Java / New Guinea hint)
  [[95, 5], [100, 0], [105, -3], [110, -4], [114, -2], [118, 0], [122, -2], [128, -3], [135, -4], [142, -5], [147, -7], [140, -8], [130, -6], [120, -8], [110, -8], [102, -4], [97, 2]],
  // Australia
  [[113, -22], [118, -18], [126, -14], [133, -12], [140, -12], [146, -16], [150, -22], [153, -28], [150, -34], [143, -39], [135, -35], [128, -32], [120, -34], [114, -30]],
  // Japan hint
  [[130, 31], [133, 34], [138, 36], [141, 40], [142, 44], [140, 42], [136, 36], [131, 33]],
  // UK hint
  [[-5, 50], [-2, 52], [-3, 56], [-6, 58], [-8, 55], [-6, 52]],
];

function toPath(ring: Array<[number, number]>): string {
  return ring
    .map(([lon, lat], i) => {
      const { x, y } = projectCountry(lat, lon);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ') + ' Z';
}

export function WorldMap({ data, unknownCount = 0, maxListRows = 12 }: Props) {
  useUiTranslation();
  const [hovered, setHovered] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const markers = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.value));
    return data
      .map((d) => {
        const coord = coordForCountry(d.name);
        if (!coord) return null;
        const { x, y } = projectCountry(coord.lat, coord.lon);
        // Area-proportional bubbles, clamped so a single outlier can't swallow the map.
        const r = 3.5 + Math.sqrt(d.value / max) * 13;
        return { ...d, coord, x, y, r, share: d.value / Math.max(1, data.reduce((s, c) => s + c.value, 0)) };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => a.r - b.r); // small on top of large... draw large first
  }, [data]);

  const unmapped = useMemo(() => data.filter((d) => !coordForCountry(d.name)), [data]);
  const total = data.reduce((s, d) => s + d.value, 0);
  const top = markers.slice().sort((a, b) => b.value - a.value)[0];
  const listRows = (showAll ? data : data.slice(0, maxListRows));

  if (data.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Globe className="w-8 h-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm">{uiI18n.t('app.no_country_data_yet_visits_will_appear_here_once_862e18b8')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span><strong className="text-foreground text-sm">{data.length}</strong> {uiI18n.t('app.countries_11ef521f')}</span>
        <span><strong className="text-foreground text-sm">{total.toLocaleString(uiI18n.language)}</strong> {uiI18n.t('app.geo_tagged_visitors_ac47cc59')}</span>
        {top && (
          <span className="truncate">{uiI18n.t('app.top_088caafd')} <strong className="text-foreground">{flagEmoji(top.coord.iso2)} {top.coord.label}</strong> ({top.value.toLocaleString(uiI18n.language)})</span>
        )}
        {unknownCount > 0 && <span>{unknownCount.toLocaleString(uiI18n.language)} {uiI18n.t('app.unknown_region_abc711c7')}</span>}
      </div>

      {/* Map */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0b1530] via-[#0a1226] to-[#070d1d]">
        <svg viewBox="0 0 1000 500" className="block h-auto w-full" role="img" aria-label={uiI18n.t('app.world_map_of_visitor_countries_9fe26f3c')}>
          {/* graticule */}
          {Array.from({ length: 11 }, (_, i) => (i + 1) * 100).map((x) => (
            <line key={`v${x}`} x1={x} y1={0} x2={x} y2={500} stroke="rgba(148,163,184,0.08)" strokeWidth={1} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (i + 1) * 83.33).map((y) => (
            <line key={`h${y}`} x1={0} y1={y} x2={1000} y2={y} stroke="rgba(148,163,184,0.08)" strokeWidth={1} />
          ))}
          {/* land */}
          {CONTINENTS.map((ring, i) => (
            <path key={i} d={toPath(ring)} fill="rgba(148,163,184,0.22)" stroke="rgba(148,163,184,0.35)" strokeWidth={1} strokeLinejoin="round" />
          ))}
          {/* markers — largest first so small ones stay visible */}
          {markers.slice().sort((a, b) => b.r - a.r).map((m) => {
            const active = hovered === m.name;
            return (
              <g
                key={m.name}
                transform={`translate(${m.x},${m.y})`}
                onMouseEnter={() => setHovered(m.name)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                <title>{uiI18n.t('app.i18n_value_0_i18n_value_1_visitors_i18n_value_2_9d64b084', { value0: m.coord.label, value1: m.value.toLocaleString(uiI18n.language), value2: (m.share * 100).toFixed(1) })}</title>
                {m === top && (
                  <circle r={m.r + 7} fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth={1.5}>
                    <animate attributeName="r" values={`${m.r + 4};${m.r + 10};${m.r + 4}`} dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.2;0.9" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}
                <motion.circle
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  r={active ? m.r + 2 : m.r}
                  fill={m === top ? 'rgba(139,92,246,0.85)' : 'rgba(34,211,238,0.75)'}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1.2}
                  style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}
                />
                {(active || m.r > 10) && (
                  <text
                    y={-m.r - 6}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={800}
                    fill="#fff"
                    stroke="rgba(0,0,0,0.7)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {flagEmoji(m.coord.iso2)} {m.value.toLocaleString(uiI18n.language)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/10 bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            {(() => {
              const m = markers.find((k) => k.name === hovered);
              return m ? `${flagEmoji(m.coord.iso2)} ${m.coord.label} — ${m.value.toLocaleString(uiI18n.language)} (${(m.share * 100).toFixed(1)}%)` : hovered;
            })()}
          </div>
        )}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[10px] font-semibold text-muted-foreground backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-violet-500" /> {uiI18n.t('app.top_country_7ca36425')}
          <span className="h-2 w-2 rounded-full bg-cyan-400" /> {uiI18n.t('app.visitor_hub_0138fa09')}
        </div>
      </div>

      {/* Full ranked list (not just top 5) */}
      <div className="space-y-2">
        {listRows.map((row, idx) => {
          const coord = coordForCountry(row.name);
          const label = coord?.label ?? row.name;
          const flag = coord ? flagEmoji(coord.iso2) : '🌐';
          const pct = total > 0 ? (row.value / total) * 100 : 0;
          return (
            <div
              key={row.name}
              onMouseEnter={() => setHovered(row.name)}
              onMouseLeave={() => setHovered(null)}
              className={`flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors ${hovered === row.name ? 'bg-primary/10' : 'hover:bg-white/5'}`}
            >
              <div className="w-6 text-center text-xs font-bold text-muted-foreground">{idx + 1}</div>
              <span className="text-base leading-none" aria-hidden>{flag}</span>
              <span className="w-40 truncate text-sm font-medium">{label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                {row.value.toLocaleString(uiI18n.language)} · {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
        {unmapped.length > 0 && (
          <p className="px-2 pt-1 text-[11px] text-muted-foreground">
            {unmapped.length} {uiI18n.t('app.region_a94a5840')}{unmapped.length === 1 ? '' : 's'} ({unmapped.map((u) => u.name).slice(0, 5).join(', ')}{unmapped.length > 5 ? '…' : ''}{uiI18n.t('app.listed_but_not_pinned_no_coordinates_on_file_74e29c70')}
          </p>
        )}
        {data.length > maxListRows && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="px-2 text-xs font-bold text-primary hover:underline"
          >
            {showAll ? uiI18n.t('app.show_top_i18n_value_0_e620c4fd', { value0: maxListRows }) : uiI18n.t('app.show_all_i18n_value_0_countries_6dd5875f', { value0: data.length })}
          </button>
        )}
      </div>
    </div>
  );
}
