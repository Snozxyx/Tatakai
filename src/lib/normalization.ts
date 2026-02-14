export interface BurstLinkEntry {
    anidb?: number;
    mal?: number;
    anilist?: number;
    ann?: number;
}

let burstLinkDb: BurstLinkEntry[] | null = null;
let isLoading = false;

export async function loadBurstLinkDb(): Promise<BurstLinkEntry[]> {
    if (burstLinkDb) return burstLinkDb;
    if (isLoading) {
        while (isLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return burstLinkDb || [];
    }

    isLoading = true;
    try {
        console.log("Loading BurstLink DB...");
        const res = await fetch("https://raw.githubusercontent.com/soruly/burstlink/master/burstlink.json");
        burstLinkDb = await res.json();
        console.log(`Loaded ${burstLinkDb?.length} entries from BurstLink`);
    } catch (e) {
        console.error("Failed to load BurstLink DB", e);
        burstLinkDb = [];
    } finally {
        isLoading = false;
    }
    return burstLinkDb || [];
}

export async function findMapping(id: number, type: keyof BurstLinkEntry): Promise<BurstLinkEntry | undefined> {
    const db = await loadBurstLinkDb();
    return db.find(entry => entry[type] === id);
}

export async function normalizeId(id: string | number): Promise<{
    anilistId?: number;
    malId?: number;
    anidbId?: number;
}> {
    const numericId = typeof id === 'string' ? parseInt(id) : id;
    if (isNaN(numericId)) return {};

    // Assume input ID is Anilist unless it looks like something else (basic heuristic)
    // Most Tatakai IDs from scrapers are Anilist IDs currently
    const mapping = await findMapping(numericId, 'anilist');
    if (mapping) {
        return {
            anilistId: mapping.anilist,
            malId: mapping.mal,
            anidbId: mapping.anidb
        };
    }

    // Try MAL
    const malMapping = await findMapping(numericId, 'mal');
    if (malMapping) {
        return {
            anilistId: malMapping.anilist,
            malId: malMapping.mal,
            anidbId: malMapping.anidb
        };
    }

    return { anilistId: numericId };
}
