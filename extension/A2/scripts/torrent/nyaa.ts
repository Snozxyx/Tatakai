/// <reference path="./anime-torrent-provider.d.ts" />
/// <reference path="../goja_plugin_types/core.d.ts" />

interface ProviderConfig {
    baseUrl: string
    category: string
}

interface RawTorrent {
    name: string
    link: string
    downloadUrl: string
    date: string
    seeders: string
    leechers: string
    downloads: string
    infoHash: string
    size: string
    metadata: $habari.Metadata
}

interface SmartQuery {
    query: string
    sortBy: string
}

type Torrent = AnimeTorrent & { metadata: $habari.Metadata }

//@ts-ignore
class Provider {
    canSmartSearch = true
    supportsAdult = false

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async getLatest(): Promise<AnimeTorrent[]> {
        try {
            const url = this.buildURL("")
            console.log("nyaa: Fetching latest from " + url)
            const res = await fetch(url)
            const rssText = res.text()
            const rawTorrents = this.parseRSSFeed(rssText)
            const torrents = rawTorrents.map(t => this.toAnimeTorrent(t))
            console.log("nyaa: Found " + torrents.length + " latest torrents")
            return torrents
        } catch (error) {
            console.error("nyaa: Error fetching latest: " + (error as Error).message)
            return []
        }
    }

    async search(options: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        try {
            const url = this.buildURL(options.query)
            console.log("nyaa: Searching for " + options.query)
            const res = await fetch(url)
            const rssText = res.text()
            const rawTorrents = this.parseRSSFeed(rssText)
            const torrents = rawTorrents.map(t => this.toAnimeTorrent(t))
            console.log("nyaa: Found " + torrents.length + " torrents")
            return torrents
        } catch (error) {
            console.error("nyaa: Error searching: " + (error as Error).message)
            return []
        }
    }

    async smartSearch(options: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        try {
            const queries = this.buildSmartSearchQueries(options)
            if (!queries || queries.length === 0) {
                console.warn("nyaa: Smart search: no queries generated")
                return []
            }

            console.log("nyaa: Executing " + queries.length + " smart search queries")

            // execute all queries in parallel
            const fetchPromises = queries.map(async (q) => {
                try {
                    const url = this.buildURL(q.query, q.sortBy)
                    console.log("nyaa: [" + q.sortBy + "] " + q.query)
                    const res = await fetch(url)
                    const rssText = res.text()
                    return this.parseRSSFeed(rssText)
                } catch (e) {
                    console.error("nyaa: Query failed: " + (e as Error).message)
                    return [] as RawTorrent[]
                }
            })

            const results = await Promise.all(fetchPromises)
            const allRaw = results.flat()

            // deduplicate
            const uniqueMap = new Map<string, RawTorrent>()
            for (const t of allRaw) {
                if (t.downloadUrl && !uniqueMap.has(t.downloadUrl)) {
                    uniqueMap.set(t.downloadUrl, t)
                }
            }

            let torrents = [...uniqueMap.values()].map(t => this.toAnimeTorrent(t))
            uniqueMap.clear()

            console.log("nyaa: " + torrents.length + " unique torrents before filtering")

            // post-filtering
            const filtered = this.filterSmartResults(torrents, options).map(({ metadata, ...t }) => t as AnimeTorrent)

            console.log("nyaa: " + filtered.length + " torrents after filtering")
            return filtered
        } catch (error) {
            console.error("nyaa: Smart search error: " + (error as Error).message)
            return []
        }
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash || ""
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        try {
            const res = await fetch(torrent.link)
            const html = res.text()
            const $ = LoadDoc(html)

            let magnetLink = ""
            $("a.card-footer-item, a[href^=\"magnet:\"]").each((i: number, el) => {
                const href = el.attr("href")
                if (href && href.startsWith("magnet:")) {
                    magnetLink = href
                    return false
                }
            })

            if (!magnetLink) {
                throw new Error("Magnet link not found on page")
            }
            return magnetLink
        } catch (error) {
            console.error("nyaa: Error fetching magnet link: " + (error as Error).message)
            throw new Error("Could not fetch magnet link for: " + torrent.name)
        }
    }

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: this.canSmartSearch,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query"],
            supportsAdult: false,
            type: "main",
        }
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    private buildSmartSearchQueries(opts: AnimeSmartSearchOptions): SmartQuery[] {
        const { media, query: userQuery, batch, episodeNumber, resolution } = opts

        // user-provided query takes priority
        if (userQuery) {
            const q = resolution ? `${userQuery} ${resolution}` : userQuery
            return [{ query: q, sortBy: "seeders" }]
        }

        // Gather all known titles
        const allTitles = [
            media.romajiTitle || "",
            media.englishTitle || "",
            ...(media.synonyms || []),
        ].filter(Boolean)

        if (allTitles.length === 0) return []

        // normalize titles
        const processed = $scannerUtils.buildSmartSearchTitles(allTitles)
        const titles: string[] = processed.titles || []
        const season = processed.season > 0 ? processed.season : 0
        const part = processed.part > 0 ? processed.part : 0

        if (titles.length === 0) return []

        // shorter titles are less restrictive -> higher
        const sorted = [...titles].sort((a, b) => a.length - b.length)

        const isMovie = media.format === "MOVIE" && (media.episodeCount || 0) === 1
        const canBatch = media.status === "FINISHED" && (media.episodeCount || 0) > 0

        let queries: SmartQuery[]

        if (batch && canBatch && !isMovie) {
            queries = this.buildBatchQueries(sorted, season, part, media, resolution)
        } else if (isMovie) {
            queries = this.buildMovieQueries(sorted, resolution)
        } else {
            queries = this.buildEpisodeQueries(sorted, season, part, episodeNumber, media, resolution)
        }

        // deduplicate and cap at 5
        const seen = new Set<string>()
        const unique: SmartQuery[] = []
        for (const q of queries) {
            const key = q.query + "|" + q.sortBy
            if (!seen.has(key)) {
                seen.add(key)
                unique.push(q)
            }
            if (unique.length >= 5) break
        }

        return unique
    }

    // Build queries for single episode searches.
    //
    // 1. Shortest title + episode (broadest catch)
    // 2. Season + episode (if season > 1)
    // 3. Part + episode (if part > 1)
    // 4. Alternative title + episode (different language/variant)
    // 5. Absolute episode number (if has absoluteSeasonOffset)
    private buildEpisodeQueries(
        sorted: string[], season: number, part: number,
        episodeNumber: number, media: Media, resolution: string
    ): SmartQuery[] {
        const queries: SmartQuery[] = []
        const resStr = resolution ? ` ${resolution}` : " (360|480|720|1080)"
        const epGroup = this.buildEpisodeGroup(episodeNumber, season)
        const primary = sorted[0]
        const secondary = sorted.length > 1 ? sorted[1] : ""
        const hasAbsoluteOffset = (media.absoluteSeasonOffset || 0) > 0

        // exact phrase OR-group
        const exactGroup = this.buildExactTitleGroup(media)
        if (exactGroup) {
            queries.push({ query: `${exactGroup}${epGroup}${resStr}`, sortBy: "seeders" })
        }

        // shortest normalized title + episode
        queries.push({ query: `${primary} ${epGroup}${resStr}`, sortBy: "seeders" })

        // season qualified if season > 1
        if (season > 1) {
            const seasonQ = $scannerUtils.buildSeasonQuery(primary, season)
            queries.push({ query: `${seasonQ} ${epGroup}${resStr}`, sortBy: "seeders" })
        }

        // part qualified if part > 1
        if (part > 1) {
            const partQ = $scannerUtils.buildPartQuery(primary, part)
            queries.push({ query: `${partQ} ${epGroup}${resStr}`, sortBy: "seeders" })
        }

        // alternative title + episode
        if (secondary) {
            queries.push({ query: `${secondary} ${epGroup}${resStr}`, sortBy: "seeders" })
        }

        // absolute episode number
        if (hasAbsoluteOffset) {
            const absEp = episodeNumber + (media.absoluteSeasonOffset || 0)
            const absEpGroup = this.buildEpisodeGroup(absEp, 0, true)
            queries.push({ query: `${primary} ${absEpGroup}${resStr}`, sortBy: "seeders" })
        }

        return queries
    }

    // Build queries for batch searches.
    //
    // 1. Title + explicit batch keywords (Batch, Complete, episode ranges)
    // 2. Season + batch terms (if season > 1)
    // 3. Title + quality/disc terms common in batches
    // 4. Alternative title + batch terms
    // 5. Title-only search sorted by size
    private buildBatchQueries(
        sorted: string[], season: number, part: number,
        media: Media, resolution: string
    ): SmartQuery[] {
        const queries: SmartQuery[] = []
        const resStr = resolution ? ` ${resolution}` : " (360|480|720|1080)"
        const primary = sorted[0]
        const secondary = sorted.length > 1 ? sorted[1] : ""
        const baseTitle = sorted.sort((a: string, b: string) => a.length - b.length)
            .find((t: string) => t !== primary && t.length >= 3) || ""
        const batchTerms = this.buildBatchTerms(media)
        const discTerms = " (BD|Blu-ray|BDRip|Remux|HEVC|x265|10bit|Dual-Audio)"

        // exact phrase OR-group (if it exists) + batch keywords
        const exactGroup = this.buildExactTitleGroup(media)
        if (exactGroup) {
            queries.push({ query: `${exactGroup}${batchTerms}${resStr}`, sortBy: "size" })
        }

        // shortest normalized title + explicit batch keywords, sorted by size
        queries.push({ query: `${primary}${batchTerms}${resStr}`, sortBy: "size" })

        // season + batch or disc terms
        if (season > 1) {
            const seasonQ = $scannerUtils.buildSeasonQuery(primary, season)
            queries.push({ query: `${seasonQ}${batchTerms}${resStr}`, sortBy: "size" })
            queries.push({ query: `${seasonQ}${discTerms}${resStr}`, sortBy: "size" })
        } else if (part > 1) {
            const partQ = $scannerUtils.buildPartQuery(primary, part)
            queries.push({ query: `${partQ}${batchTerms}${resStr}`, sortBy: "size" })
        }

        // title + disc/quality terms
        queries.push({ query: `${primary}${discTerms}${resStr}`, sortBy: "size" })

        // alternative title + batch terms
        if (secondary) {
            queries.push({ query: `${secondary}${batchTerms}${resStr}`, sortBy: "size" })
        }

        // title-only search sorted by size
        queries.push({ query: `${primary}${resStr}`, sortBy: "size" })

        return queries
    }

    // Build queries for movie searches (no episode number)
    private buildMovieQueries(sorted: string[], resolution: string): SmartQuery[] {
        const queries: SmartQuery[] = []
        const resStr = resolution ? ` ${resolution}` : " (360|480|720|1080)"
        const primary = sorted[0]
        const secondary = sorted.length > 1 ? sorted[1] : ""

        queries.push({ query: `${primary}${resStr}`, sortBy: "seeders" })
        if (secondary) {
            queries.push({ query: `${secondary}${resStr}`, sortBy: "seeders" })
        }
        // Also try with common quality terms
        queries.push({ query: `${primary} (BD|Blu-ray|BDRip|HEVC)${resStr}`, sortBy: "seeders" })

        return queries
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Post-filter results for accuracy
    // verify episode number (relative or absolute), season, title
    // verify batch status, season, title match
    // verify title match
    private filterSmartResults(torrents: Torrent[], opts: AnimeSmartSearchOptions): Torrent[] {
        const { media, batch, episodeNumber } = opts
        const isMovie = media.format === "MOVIE" && (media.episodeCount || 0) === 1
        const expectedSeason = this.getExpectedSeason(media)
        const hasAbsoluteOffset = (media.absoluteSeasonOffset || 0) > 0
        const absEp = hasAbsoluteOffset ? episodeNumber + (media.absoluteSeasonOffset || 0) : -1
        const minDate = this.getMediaMinDate(media)

        if (batch) {
            return this.filterBatchResults(torrents, media, expectedSeason, minDate)
        }

        if (isMovie) {
            return torrents.filter(t => {
                if (!this.torrentMatchesMedia(t.name, media, 0.6, t.metadata)) return false
                if (!this.torrentAfterDate(t, minDate)) return false
                return true
            })
        }

        // Single episode filtering
        return torrents.filter(t => {
            const ep = t.episodeNumber ?? -1

            // must have an episode number
            if (ep < 0) return false

            // episode must match (relative OR absolute)
            if (ep !== episodeNumber && (absEp < 0 || ep !== absEp)) return false

            // title verification w strict threshold
            // same-franchise wrong entries (e.g. different KnY seasons)
            if (!this.torrentMatchesMedia(t.name, media, 0.75, t.metadata)) return false

            // reject torrents released before the anime started
            if (!this.torrentAfterDate(t, minDate)) return false

            // skip season verification for absolute numbering (spans seasons)
            // and skip when expectedSeason is 0 (unknown/undetected)
            if (!hasAbsoluteOffset && expectedSeason > 0) {
                const torrentSeason = this.getTorrentSeason(t.name, t.metadata)

                if (expectedSeason > 1) {
                    if (torrentSeason > 0 && torrentSeason !== expectedSeason) return false
                } else {
                    // season 1: reject if torrent explicitly indicates season 2+
                    if (torrentSeason > 1) return false
                }
            }

            // Part verification
            const expectedPart = this.getExpectedPart(media)
            if (expectedPart > 0) {
                const torrentPart = this.getTorrentPart(t.name, t.metadata)
                // If torrent explicitly indicates a different part, reject
                if (torrentPart > 0 && torrentPart !== expectedPart) return false
            } else {
                // Media has no part — reject torrents that explicitly indicate a part
                // (e.g. media is "Re:Zero" but torrent says "Part 2")
                const torrentPart = this.getTorrentPart(t.name, t.metadata)
                if (torrentPart > 1) return false
            }

            return true
        })
    }

    // Filter batch results specifically.
    // must be a batch AND must match the anime title.
    private filterBatchResults(torrents: Torrent[], media: Media, expectedSeason: number, minDate: number): Torrent[] {
        return torrents.filter(t => {
            const ep = t.episodeNumber ?? -1
            const containsComplete = this.torrentContainsCompleteKeywords(t.name)

            // must be a batch (multi-episode range or no-episode with title match)
            const isBatch = t.isBatch || (ep === -1 && this.torrentMatchesMedia(t.name, media, 0.6, t.metadata))
            if (!isBatch) return false

            // must not be a single episode
            if (ep > 0) return false

            // title must match the anime (batch titles are often shortened)
            if (!this.torrentMatchesMedia(t.name, media, 0.6, t.metadata)) return false

            // reject torrents from before the anime started airing
            if (!this.torrentAfterDate(t, minDate)) return false

            // complete series -> probably the correct one
            if (containsComplete) {
                return true
            }

            // season verification for batches, only when we detected a season
            if (expectedSeason > 0) {
                const torrentSeason = this.getTorrentSeason(t.name, t.metadata)
                const multiSeasonRange = this.getMultiSeasonRange(t.name)

                if (multiSeasonRange) {
                    // multi-season pack: expected season must be within the range
                    if (expectedSeason < multiSeasonRange[0] || expectedSeason > multiSeasonRange[1]) return false
                } else if (expectedSeason > 1) {
                    // expecting season > 1: reject if torrent has a different season
                    // OR has no season indicator (no-season batch = almost certainly S1?)
                    if (torrentSeason !== expectedSeason && !containsComplete) return false
                } else {
                    // season 1: reject if torrent explicitly indicates season 2+
                    if (torrentSeason > 1 && !containsComplete) return false
                }
            }

            // Part verification for batches
            const expectedPart = this.getExpectedPart(media)
            if (expectedPart > 0) {
                const torrentPart = this.getTorrentPart(t.name, t.metadata)
                // If torrent explicitly indicates a different part, reject (unless complete)
                if (torrentPart > 0 && torrentPart !== expectedPart && !containsComplete) return false
            } else {
                // Media has no part — reject batches that explicitly indicate a part > 1
                // (e.g. searching for full "Re:Zero" but torrent says "Part 2")
                // unless it's marked as complete
                const torrentPart = this.getTorrentPart(t.name, t.metadata)
                if (torrentPart > 1 && !containsComplete) return false
            }

            return true
        })
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    private getMediaMinDate(media: Media): number {
        if (!media.startDate || !media.startDate.year) return 0
        const year = media.startDate.year
        const month = (media.startDate.month || 1) - 1 // JS months are 0-indexed
        const day = media.startDate.day || 1
        const startDate = new Date(year, month, day)
        // Subtract 3 months as delta
        startDate.setMonth(startDate.getMonth() - 3)
        return startDate.getTime()
    }

    // returns true if no minDate is set (0) or if the torrent is after the date
    private torrentAfterDate(torrent: AnimeTorrent, minDate: number): boolean {
        if (minDate <= 0) return true // no date constraint
        if (!torrent.date) return true // no date info on torrent, allow it
        try {
            const torrentTime = new Date(torrent.date).getTime()
            if (isNaN(torrentTime)) return true // can't parse, allow it
            return torrentTime >= minDate
        } catch {
            return true
        }
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    private getExpectedSeason(media: Media): number {
        const titles = [
            media.romajiTitle || "",
            media.englishTitle || "",
            ...(media.synonyms || []),
        ].filter(Boolean)

        for (const t of titles) {
            const s = $scannerUtils.extractSeasonNumber(t)
            if (s > 0) return s
        }
        return 0
    }

    // extract season number from a torrent name
    private getTorrentSeason(torrentName: string, metadata: $habari.Metadata): number {
        // check habari season_number first
        if (metadata.season_number && metadata.season_number.length > 0) {
            const s = parseInt(metadata.season_number[0])
            if (s > 0) return s
        }

        // fallback to comprehensive extraction
        return $scannerUtils.extractSeasonNumber(torrentName)
    }

    private getExpectedPart(media: Media): number {
        const titles = [
            media.romajiTitle || "",
            media.englishTitle || "",
            ...(media.synonyms || []),
        ].filter(Boolean)

        for (const t of titles) {
            const p = $scannerUtils.extractPartNumber(t)
            if (p > 0) return p
        }
        return 0
    }

    // extract part number from a torrent name
    private getTorrentPart(torrentName: string, metadata: $habari.Metadata): number {
        if (metadata.part_number && metadata.part_number.length > 0) {
            // If multiple parts detected (e.g. "Part 1 & 2"), return -1 to signal multi-part
            if (metadata.part_number.length > 1) return -1
            const p = parseInt(metadata.part_number[0])
            if (p > 0) return p
        }

        // fallback to comprehensive extraction
        return $scannerUtils.extractPartNumber(torrentName)
    }

    // verify that a torrent name matches the anime using weighted token matching
    // using 0.75 for episode search (strict, can rejects wrong series)
    // and 0.6 for batch search (allows shortened titles)
    private torrentMatchesMedia(torrentName: string, media: Media, threshold: number, metadata: $habari.Metadata): boolean {
        const parsedTitle = metadata.title || metadata.formatted_title || ""
        if (!parsedTitle) return false

        const mediaTitles = [
            media.romajiTitle || "",
            media.englishTitle || "",
            ...(media.synonyms || []),
            // ...this.getBaseFranchiseTitles(media),
        ].filter(Boolean)

        for (const mediaTitle of mediaTitles) {
            const ratio = $scannerUtils.compareTitles(parsedTitle, mediaTitle)
            if (ratio >= threshold) return true
        }

        return false
    }

    // this ensures broad queries that catch torrents using different naming conventions
    private getBaseFranchiseTitles(media: Media): string[] {
        const rawTitles = [
            media.romajiTitle || "",
            media.englishTitle || "",
        ].filter(Boolean)

        const seen = new Set<string>()
        const bases: string[] = []

        const addBase = (t: string) => {
            const q = $scannerUtils.buildSearchQuery(t)
            if (q && q.length >= 3 && !seen.has(q)) {
                seen.add(q)
                bases.push(q)
            }
        }

        for (const raw of rawTitles) {
            // colon split: "Title: Subtitle" → "Title"
            const colonIdx = raw.indexOf(":")
            if (colonIdx > 4) {
                addBase(raw.substring(0, colonIdx))
            }

            // dash split: "Title - Subtitle" → "Title"
            const dashIdx = raw.indexOf(" - ")
            if (dashIdx > 4) {
                addBase(raw.substring(0, dashIdx))
            }

            // strip common season/subtitle suffixes
            const stripped = raw
                .replace(/\s+(?:The\s+)?Final(?:\s+Season)?$/i, "")
                .replace(/\s+Final$/i, "")
                .replace(/\s+Season\s+\d+$/i, "")
                .replace(/\s+\d+(?:st|nd|rd|th)\s+Season$/i, "")
                .replace(/\s+Part\s+\d+$/i, "")
                .replace(/\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/i, "")
            if (stripped !== raw && stripped.length >= 4) {
                addBase(stripped)
            }
        }

        return bases
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // detect if a torrent name suggests a batch release via keywords/patterns
    private isTorrentLikelyBatch(name: string): boolean {
        if (this.torrentContainsBatchKeywords(name)) return true

        // episode range patterns: "01-12", "01 - 12", "01~12", "01 ~ 12"
        const rangeMatch = name.match(/(?:^|[\s\[\(])0*(\d{1,3})\s*[-~]\s*0*(\d{1,3})(?:[\s\]\)]|$)/)
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1])
            const end = parseInt(rangeMatch[2])
            if (end > start && start >= 1 && end <= 300) return true
        }

        // "E01-E12" or "E01~E12"
        if (/\be\d{1,3}\s*[-~]\s*e?\d{1,3}\b/i.test(name)) return true

        if (/\bvol\.?\s*\d+\s*[-~]\s*\d+/i.test(name)) return true

        return false
    }

    private torrentContainsBatchKeywords(name: string): boolean {
        if (/\b(?:Batch)\b/i.test(name)) return true
        return this.torrentContainsCompleteKeywords(name);
    }
    private torrentContainsCompleteKeywords(name: string): boolean {
        return /\bcomplete\s+series\b/i.test(name);


    }

    // extract the season range from a multi-season batch torrent name
    // returns [startSeason, endSeason] if detected
    // e.g. "Season 1-3", "Seasons 1~4", "S01-S03", "S1-4", "Complete Series"
    private getMultiSeasonRange(name: string): [number, number] | null {
        let m = name.match(/\bseasons?\s*(\d+)\s*[-~]\s*(\d+)/i)
        if (m) {
            const s = parseInt(m[1]), e = parseInt(m[2])
            if (e > s && s >= 1) return [s, e]
        }

        // "S01-S03", "S1~S3", "S1-4" (second S is optional)
        m = name.match(/\bS(\d{1,2})\s*[-~]\s*S?(\d{1,2})\b/i)
        if (m) {
            const s = parseInt(m[1]), e = parseInt(m[2])
            if (e > s && s >= 1) return [s, e]
        }

        if (/\bcomplete\s+series\b/i.test(name)) return [1, 99]

        return null
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    private buildExactTitleGroup(media: Media): string {
        let titles = [media.romajiTitle || "", media.englishTitle || "", ...(media.synonyms || [])].filter(Boolean)
        const season = this.getExpectedSeason(media)

        titles = titles.map(t => {
            let clean = t.replace(/:/g, " ").replace(/-/g, " ").trim()
            clean = clean.replace(/×/g, " x ").replace(/＊/g, " * ")
            clean = clean.replace(/[()[\]{}|"'~?\\^!]/g, "") // remove syntax breakers
            clean = clean.replace(/\s+/g, " ")
            clean = clean.toLowerCase()
            if (season !== 0) {
                clean = clean.replace(/\biii\b/gi, "").replace(/\bii\b/gi, "")
            }
            return clean.trim()
        }).filter(Boolean)

        titles = [...new Set(titles)].slice(0, 3)
        if (titles.length === 0) return ""

        return `(${titles.map(t => `"${t}"`).join("|")})`
    }

    // Build an episode number OR group.
    // e.g. "05", "E05", "EP05", "EP5", "E05v2", "05v2", "S02E05"
    private buildEpisodeGroup(ep: number, season?: number, isAbsolute: boolean = false): string {
        const padded = this.zeropad(ep)
        let terms = [`${padded}`, `E${padded}`, `EP${padded}`, `EP${ep}`]

        if (!isAbsolute) {
            const actualSeason = (season && season > 0) ? season : 1;
            const sPadded = this.zeropad(actualSeason)
            terms.push(`S${sPadded}E${padded}`)
        }

        terms = [...new Set(terms)]
        return `(${terms.join("|")})`
    }

    // Build batch search terms — explicit keywords and episode ranges.
    private buildBatchTerms(media: Media): string {
        const epCount = this.zeropad(media.episodeCount || 0)
        const parts = [
            `"Batch"`,
            `"Complete"`,
            `"01 - ${epCount}"`,
            `"01-${epCount}"`,
            `"01 ~ ${epCount}"`,
            `"01~${epCount}"`,
            `"E01-E${epCount}"`,

            // `"S1-2"`, `"S01-02"`, `"S01 - 02"`, `"S01-S02"`, `"S01 - S02"`, `"S01 ~ S02"`, `"S01 ~ 02"`, `"S01~S02"`,
            // `"S1-3"`, `"S01-03"`, `"S01 - 03"`, `"S01-S03"`, `"S01 - S03"`, `"S01 ~ S03"`, `"S01 ~ 03"`, `"S01~S03"`, `"S1+S2+S3"`, `"S01+S02+S03"`,
            // `"S1-4"`, `"S01-04"`, `"S01 - 04"`, `"S01-S04"`, `"S01 - S04"`, `"S01 ~ S04"`, `"S01 ~ 04"`, `"S01~S04"`, `"S1+S2+S3+S4"`, `"S01+S02+S03+S04"`,
            // `"S1-5"`, `"S01-05"`, `"S01 - 05"`, `"S01-S05"`, `"S01 - S05"`, `"S01 ~ S05"`, `"S01 ~ 05"`, `"S01~S05"`,
        ]
        if (!media.episodeCount) {
            parts.slice(0, 2)
        }
        return ` (${parts.join("|")})`
    }

    private zeropad(v: number): string {
        const s = String(v)
        return s.length < 2 ? "0" + s : s
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    private getProviderSettings(): ProviderConfig {
        let url: string = $getUserPreference("apiUrl") || "nyaa.si"
        if (!url.startsWith("http")) {
            url = "https://" + url
        }
        return {
            baseUrl: url.replace(/\/$/, ""),
            category: $getUserPreference("category") || "1_2",
        }
    }

    private buildURL(query: string, sortBy: string = "seeders"): string {
        const { baseUrl, category } = this.getProviderSettings()
        const queryString = `page=rss&q=${encodeURIComponent(query)}&c=${category}&f=0&s=${sortBy}&o=desc`
        return `${baseUrl}/?${queryString}`
    }

    private parseRSSFeed(rssText: string): RawTorrent[] {
        const torrents: RawTorrent[] = []

        const getTagContent = (xml: string, tag: string): string => {
            const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`)
            const match = xml.match(regex)
            return match ? match[1].trim() : ""
        }

        const getNyaaTagContent = (xml: string, tag: string): string => {
            const regex = new RegExp(`<nyaa:${tag}[^>]*>([^<]*)</nyaa:${tag}>`)
            const match = xml.match(regex)
            return match ? match[1].trim() : ""
        }

        const itemRegex = /<item>([\s\S]*?)<\/item>/g
        let match

        while ((match = itemRegex.exec(rssText)) !== null) {
            const itemXml = match[1]
            const name = getTagContent(itemXml, "title")
            if (!name) continue
            const metadata = $habari.parse(name)
            torrents.push({
                name: name,
                link: getTagContent(itemXml, "guid"),
                downloadUrl: getTagContent(itemXml, "link"),
                date: getTagContent(itemXml, "pubDate"),
                seeders: getNyaaTagContent(itemXml, "seeders"),
                leechers: getNyaaTagContent(itemXml, "leechers"),
                downloads: getNyaaTagContent(itemXml, "downloads"),
                infoHash: getNyaaTagContent(itemXml, "infoHash"),
                size: getNyaaTagContent(itemXml, "size"),
                metadata: metadata,
            })
        }

        return torrents
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    private toAnimeTorrent(t: RawTorrent): Torrent {
        const seeders = parseInt(t.seeders) || 0
        const leechers = parseInt(t.leechers) || 0
        const downloads = parseInt(t.downloads) || 0

        let formattedDate = ""
        try {
            const parsedDate = new Date(t.date)
            if (!isNaN(parsedDate.getTime())) {
                formattedDate = parsedDate.toISOString()
            }
        } catch (e) { }

        let sizeInBytes = 0
        const sizeMatch = t.size.match(/([\d.]+)\s*([KMGT]?i?B)/i)
        if (sizeMatch) {
            const sz = parseFloat(sizeMatch[1])
            const unit = sizeMatch[2].toUpperCase()
            if (unit.endsWith("IB")) {
                if (unit.startsWith("M")) sizeInBytes = sz * Math.pow(1024, 2)
                else if (unit.startsWith("G")) sizeInBytes = sz * Math.pow(1024, 3)
                else if (unit.startsWith("T")) sizeInBytes = sz * Math.pow(1024, 4)
                else sizeInBytes = sz * 1024
            } else {
                if (unit.startsWith("M")) sizeInBytes = sz * Math.pow(1000, 2)
                else if (unit.startsWith("G")) sizeInBytes = sz * Math.pow(1000, 3)
                else if (unit.startsWith("T")) sizeInBytes = sz * Math.pow(1000, 4)
                else sizeInBytes = sz * 1000
            }
        }

        let episode = -1
        if (t.metadata.episode_number && t.metadata.episode_number.length >= 1) {
            episode = parseInt(t.metadata.episode_number[0]) || -1
        }

        let isBatchByGuess = false
        if (t.metadata.episode_number && t.metadata.episode_number.length > 1) {
            const first = parseInt(t.metadata.episode_number[0]) || 0
            const last = parseInt(t.metadata.episode_number[t.metadata.episode_number.length - 1]) || 0
            if (last > first && (last - first) <= 50) {
                isBatchByGuess = true
            }
        }
        // if (!isBatchByGuess) {
        //     isBatchByGuess = this.isTorrentLikelyBatch(t.name)
        // }

        if (isBatchByGuess) {
            episode = -1
        }

        return {
            name: t.name,
            date: formattedDate,
            size: Math.round(sizeInBytes),
            formattedSize: t.size,
            seeders: seeders,
            leechers: leechers,
            downloadCount: downloads,
            link: t.link,
            downloadUrl: t.downloadUrl,
            infoHash: t.infoHash,
            magnetLink: "",
            resolution: t.metadata.video_resolution || "",
            isBatch: isBatchByGuess,
            episodeNumber: episode,
            releaseGroup: t.metadata.release_group || "",
            isBestRelease: false,
            confirmed: false,
            metadata: t.metadata,
        }
    }

}
