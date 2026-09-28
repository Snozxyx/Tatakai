import type { CSSProperties } from 'react';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

/** 
 * Represents a generic media server source. 
 * Defines the properties we check against for grouping and sorting.
 */
export interface ProviderServer {
    sourceType?: string;
    isTorrent?: boolean;
    isDub?: boolean;
    languageLabel?: string;
    audioLanguage?: string;
    language?: string;
    // Allow any other properties to pass through cleanly
    [key: string]: unknown;
}

export interface GroupedLanguages {
    label: string;
    servers: ProviderServer[];
}

// -----------------------------------------------------------------------------
// CONSTANTS
// -----------------------------------------------------------------------------

/**
 * Scoped ambient accent for the Watch2Together room — mirrors the profile
 * page's `--profile-accent` pattern. Every glow/border/label is derived from
 * hsl(var(--isshoni-accent) / α), matching the lobby's accent.
 */
export const ISSHONI_ACCENT = '327 82% 60%';

export const isshoniAccentStyle = { 
    '--isshoni-accent': ISSHONI_ACCENT 
} as CSSProperties;

/** Poll-length options for the header poll maker (mirrors the community composer). */
export const POLL_DURATION = {
    days: Array.from({ length: 8 }, (_, i) => i),
    hours: Array.from({ length: 24 }, (_, i) => i),
    minutes: Array.from({ length: 60 }, (_, i) => i),
} as const;

// -----------------------------------------------------------------------------
// UTILITIES
// -----------------------------------------------------------------------------

/** Helper to ensure Subtitled comes first, Dubbed second, and others A-Z */
function getLanguageRank(label: string): number {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes('sub')) return 0;
    if (lowerLabel.includes('dub')) return 1;
    return 2;
}

/**
 * Group resolved provider servers for the room's source panel.
 * Playable servers are bucketed by spoken/subtitle LANGUAGE.
 * Torrent releases are pulled into their own distinct array.
 */
export function groupProviderServers(providerServers: ProviderServer[] = []) {
    const torrents: ProviderServer[] = [];
    const langMap = new Map<string, ProviderServer[]>();

    for (const server of providerServers) {
        // 1. Separate Torrents immediately
        if (server.sourceType === 'torrent' || server.isTorrent) {
            torrents.push(server);
            continue;
        }

        // 2. Resolve raw language string
        const raw = String(server.languageLabel || server.audioLanguage || server.language || '').trim();
        const isDub = Boolean(server.isDub) || /dub/i.test(raw);
        
        // 3. Format the label beautifully
        let label = isDub ? 'Dubbed' : 'Subtitled';
        
        if (raw) {
            // Capitalize first letter of the raw string if it exists
            label = raw.charAt(0).toUpperCase() + raw.slice(1);
        }

        // 4. Group by label
        if (!langMap.has(label)) {
            langMap.set(label, []);
        }
        langMap.get(label)!.push(server);
    }

    // 5. Transform Map into an array and sort it based on Rank (Sub > Dub > Other)
    const languages: GroupedLanguages[] = Array.from(langMap.entries())
        .map(([label, servers]) => ({ label, servers }))
        .sort((a, b) => getLanguageRank(a.label) - getLanguageRank(b.label) || a.label.localeCompare(b.label));

    // 6. Return standard structured object
    return { 
        languages, 
        torrents, 
        all: languages.flatMap(group => group.servers) 
    };
}