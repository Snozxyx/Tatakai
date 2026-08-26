/**
 * Region-aware notes shown before the app joins a BitTorrent swarm.
 *
 * Switching a source from a hosted stream to a torrent changes what the app
 * *does on the user's behalf*: it joins a public swarm, which publishes their IP
 * address to every other peer, uploads data back to them, and writes the whole
 * file to disk. None of that is true of the embed/HLS sources, so it is worth
 * one explicit confirmation rather than being a side effect of clicking a
 * differently-coloured button.
 *
 * The notes below are **general information, not legal advice**, they describe
 * the situation as commonly reported rather than any user's specific case, and
 * copyright enforcement changes often. That caveat is rendered in the dialog
 * too — it is not decoration here.
 */

export type TorrentEnforcementLevel =
  /** Active monitoring of swarms and routine legal/financial demands. */
  | 'high'
  /** Site blocking and forwarded rights-holder notices are the norm. */
  | 'moderate'
  /** Downloading for private use is broadly tolerated; sharing is not. */
  | 'personal-use-tolerated'
  /** Region could not be determined, or is not covered below. */
  | 'unknown';

export interface TorrentRegionPolicy {
  /** ISO 3166-1 alpha-2, or `''` when the region could not be resolved. */
  regionCode: string;
  /** Human-readable region name, localized where the browser can do it. */
  regionName: string;
  level: TorrentEnforcementLevel;
  /** One line, safe to render as a heading. */
  headline: string;
  /** Two or three sentences of specifics. */
  detail: string;
}

interface PolicyEntry {
  level: TorrentEnforcementLevel;
  headline: string;
  detail: string;
}

/**
 * Per-region notes. Deliberately short and descriptive: what rights-holders and
 * ISPs are commonly reported to do, not a prediction about any individual.
 */
const REGION_POLICIES: Record<string, PolicyEntry> = {
  DE: {
    level: 'high',
    headline: 'Germany is among the most actively enforced regions',
    detail:
      'Law firms acting for rights-holders monitor public swarms and send cease-and-desist letters (Abmahnung) with fee demands to the subscriber behind the IP address. Demands of several hundred euros for a single title are routine.',
  },
  JP: {
    level: 'high',
    headline: 'Japan treats uploading copyrighted works as a criminal offence',
    detail:
      'Making copyrighted works available carries criminal penalties, and knowingly downloading pirated material is also unlawful — since 2021 that extends beyond music and video to manga and other works. BitTorrent uploads by design, so seeding is the exposed part.',
  },
  US: {
    level: 'high',
    headline: 'United States: ISP notices and civil suits over swarm IPs',
    detail:
      'ISPs forward DMCA notices and may throttle or terminate repeat-infringer accounts. Rights-holders also file civil suits naming IP addresses collected from swarms, then subpoena the ISP for the subscriber.',
  },
  FR: {
    level: 'high',
    headline: 'France operates a graduated-response scheme',
    detail:
      'Arcom (formerly HADOPI) collects IP addresses from public swarms and issues escalating warnings that can lead to fines. Notices go to the internet subscriber, not necessarily the person who ran the client.',
  },
  KR: {
    level: 'high',
    headline: 'South Korea enforces copyright aggressively',
    detail:
      'Rights-holders and authorities pursue both uploaders and repeat downloaders, and accounts can be suspended under repeat-infringement rules. Settlement demands sent to individuals are common.',
  },
  DK: {
    level: 'high',
    headline: 'Denmark has seen large rights-holder letter campaigns',
    detail:
      'Firms acting for rights-holders have collected swarm IP addresses at scale and sent settlement demands to subscribers, alongside court-ordered blocking of torrent sites.',
  },
  SE: {
    level: 'moderate',
    headline: 'Sweden: settlement letters and site blocking',
    detail:
      'Rights-holders have obtained subscriber details from ISPs by court order and sent payment demands. Torrent sites are also subject to blocking orders.',
  },
  FI: {
    level: 'moderate',
    headline: 'Finland: subscriber-details orders and settlement demands',
    detail:
      'Courts have ordered ISPs to disclose subscriber details behind swarm IP addresses, followed by letters seeking payment. Site blocking is in force.',
  },
  NO: {
    level: 'moderate',
    headline: 'Norway: blocking orders and rights-holder notices',
    detail:
      'Torrent sites are blocked by court order and rights-holders can seek subscriber details. Enforcement against individuals is less routine than in Germany or Denmark.',
  },
  GB: {
    level: 'moderate',
    headline: 'United Kingdom: forwarded warnings and blocked sites',
    detail:
      'ISPs forward rights-holder warning notices to subscribers, and courts have ordered widespread blocking of torrent indexes. Civil claims against individuals happen but are less common.',
  },
  IE: {
    level: 'moderate',
    headline: 'Ireland: graduated notices via ISPs',
    detail:
      'ISPs operate notice schemes with rights-holders that escalate on repeat detections, and blocking orders cover major torrent sites.',
  },
  NL: {
    level: 'moderate',
    headline: 'Netherlands: downloading from illegal sources is unlawful',
    detail:
      'The 2014 ECJ ruling ended the previous tolerance for private downloading. BREIN pursues uploaders and large-scale sharers, and has obtained subscriber details by court order.',
  },
  BE: {
    level: 'moderate',
    headline: 'Belgium: site blocking and rights-holder action',
    detail:
      'Torrent sites are blocked by court order and rights-holders pursue uploaders. Individual notices are less systematic than in neighbouring Germany.',
  },
  AT: {
    level: 'moderate',
    headline: 'Austria: letters modelled on the German approach',
    detail:
      'Law firms monitor swarms and send demands to subscribers, and courts have permitted disclosure of subscriber details in copyright cases.',
  },
  IT: {
    level: 'moderate',
    headline: 'Italy: AGCOM blocking and administrative fines',
    detail:
      'AGCOM can order rapid blocking of infringing services, and financial penalties for sharing copyrighted works exist. Enforcement focuses on services more than individual downloaders.',
  },
  AU: {
    level: 'moderate',
    headline: 'Australia: site blocking, and past mass-IP litigation',
    detail:
      'Rights-holders hold standing orders to block torrent sites, and have previously sought subscriber details from ISPs for swarm IP addresses (the Dallas Buyers Club case).',
  },
  NZ: {
    level: 'moderate',
    headline: 'New Zealand: three-notice regime with tribunal penalties',
    detail:
      'Rights-holders can send escalating notices via the ISP; after the third, the Copyright Tribunal can award penalties against the account holder.',
  },
  CA: {
    level: 'moderate',
    headline: 'Canada: notice-and-notice, forwarded by your ISP',
    detail:
      'ISPs are required to forward rights-holder notices to subscribers. Statutory damages for non-commercial infringement are capped, but settlement demand letters are common and sometimes overstate exposure.',
  },
  SG: {
    level: 'moderate',
    headline: 'Singapore: site blocking and past mass letters',
    detail:
      'Blocking orders cover major torrent sites, and rights-holders have previously sent letters seeking payment from subscribers identified through swarms.',
  },
  IN: {
    level: 'moderate',
    headline: 'India: John Doe orders and ISP warning pages',
    detail:
      'Courts issue broad "John Doe" blocking orders and ISPs display warning notices citing possible imprisonment and fines. Enforcement against individual downloaders is rare in practice but the warnings are real.',
  },
  ID: {
    level: 'moderate',
    headline: 'Indonesia: widespread blocking of infringing services',
    detail:
      'Authorities block infringing sites at scale. Action against individual downloaders is uncommon, but the underlying acts remain unlawful.',
  },
  BR: {
    level: 'moderate',
    headline: 'Brazil: enforcement aimed at services',
    detail:
      'Operations target infringing sites and apps rather than individual peers, though sharing copyrighted works remains unlawful.',
  },
  ES: {
    level: 'personal-use-tolerated',
    headline: 'Spain: private copying is treated differently from sharing',
    detail:
      'Downloading for private, non-commercial use has generally not been pursued criminally, but making works available to others — which is what seeding does — is. Sites are blocked by administrative order.',
  },
  PL: {
    level: 'personal-use-tolerated',
    headline: 'Poland: private-use downloading, but not making available',
    detail:
      'Personal-use copying is broadly permitted, while making a work available to others is not — and a BitTorrent client uploads to peers as a condition of downloading.',
  },
  CH: {
    level: 'personal-use-tolerated',
    headline: 'Switzerland: downloading for private use is lawful; sharing is not',
    detail:
      'Private-use downloading is permitted, and monitoring peers to collect IP addresses was restricted by the Federal Supreme Court (Logistep). Uploading and sharing remain unlawful, and the 2020 copyright revision strengthened rights-holder tools.',
  },
};

/** Applies when the region is unknown or has no entry above. */
const DEFAULT_POLICY: PolicyEntry = {
  level: 'unknown',
  headline: 'Local rules on torrenting vary and can be strict',
  detail:
    'In most countries, sharing copyrighted works without permission is unlawful even when the download is for personal use, and many ISPs forward rights-holder notices to the subscriber. Check what applies where you are.',
};

/**
 * Best-effort region for the person using the app, as an ISO 3166-1 alpha-2 code.
 *
 * Uses the browser's own locale list — no network call, no IP geolocation, so
 * nothing about the user leaves the machine to produce this. That means it
 * reflects *language settings*, not physical location: a user in Germany running
 * an en-US build resolves to `US`. The dialog therefore presents the region as
 * a guess and always shows the universal notes as well.
 */
export function resolveViewerRegion(): string {
  const candidates: string[] = [];

  try {
    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
      if (navigator.language) candidates.push(navigator.language);
    }
  } catch {
    // Ignore — fall through to the resolved Intl locale.
  }

  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions().locale;
    if (resolved) candidates.push(resolved);
  } catch {
    // Ignore.
  }

  for (const tag of candidates) {
    const region = regionOfLocale(tag);
    if (region) return region;
  }

  return '';
}

function regionOfLocale(tag: string): string {
  const value = String(tag || '').trim();
  if (!value) return '';

  try {
    // `Intl.Locale` handles the awkward tags (`zh-Hant-TW`, `sr-Cyrl-RS`).
    const region = new (Intl as any).Locale(value).region;
    if (region) return String(region).toUpperCase();
  } catch {
    // Not available or invalid tag — fall back to parsing the subtags.
  }

  const parts = value.replace(/_/g, '-').split('-');
  for (const part of parts.slice(1)) {
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
  }
  return '';
}

function regionDisplayName(code: string): string {
  if (!code) return 'your region';
  try {
    const names = new (Intl as any).DisplayNames(undefined, { type: 'region' });
    const name = names.of(code);
    if (name && name !== code) return String(name);
  } catch {
    // Ignore — the raw code is an acceptable label.
  }
  return code;
}

/**
 * The note to show for a region. Pass a code to override detection (useful for
 * tests and for a future explicit setting); omit it to use the browser locale.
 */
export function getTorrentRegionPolicy(regionCode?: string): TorrentRegionPolicy {
  const code = String(regionCode ?? resolveViewerRegion() ?? '').trim().toUpperCase();
  const entry = (code && REGION_POLICIES[code]?.headline) ? REGION_POLICIES[code] : DEFAULT_POLICY;

  return {
    regionCode: code,
    regionName: regionDisplayName(code),
    level: entry.level,
    headline: entry.headline,
    detail: entry.detail,
  };
}

/**
 * Facts that hold regardless of region, because they are properties of the
 * protocol rather than of any legal system.
 */
export const TORRENT_UNIVERSAL_NOTES: string[] = [
  'A BitTorrent client uploads to other peers while it downloads — sharing is not an optional extra you can decline.',
  'Your IP address is visible to every other peer in the swarm, and to anyone monitoring it.',
  'A VPN changes which address the swarm sees; it does not change what is lawful where you are.',
];
