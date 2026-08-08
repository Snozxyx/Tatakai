/// <reference path="../anime-torrent-provider.d.ts" />
/// <reference path="../../core.d.ts" />

interface SeaDexTorrent {
    name: string;
    date: string;
    size: number;
    link: string;
    infoHash: string;
    releaseGroup?: string;
}

interface TrFile {
    length: number;
    path: string;
}

interface Tr {
    id: string;
    collectionId: string;
    collectionName: string;
    created: string;
    updated: string;
    entry: string;
    url: string;
    infoHash: string;
    releaseGroup: string;
    source: string;
    tracker: string;
    type: string;
    files: TrFile[];
    dualAudio: boolean;
}

interface ExpandData {
    trs: Tr[];
}

interface RecordItem {
    id: string;
    collectionId: string;
    collectionName: string;
    created: string;
    updated: string;
    alID: number;
    title: string;
    expand: ExpandData;
}

interface RecordsResponse {
    page: number;
    perPage: number;
    totalItems: number;
    totalPages: number;
    items: RecordItem[];
}

class Provider {
    defaultUri = "https://releases.moe/api/collections/entries/records"

    public getSettings(): AnimeProviderSettings {
        return {
            type: "special",
            canSmartSearch: true, // Allowed for previews
            supportsAdult: false,
            smartSearchFilters: [],
        }
    }

    public async getLatest(): Promise<AnimeTorrent[]> {
        return []
    }

    public async search(options: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        return this.findTorrents(options.media)
    }

    public async smartSearch(options: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        return this.findTorrents(options.media)
    }

    private async findTorrents(media: AnimeSearchOptions["media"]): Promise<AnimeTorrent[]> {
        if (!media || !media.id) {
            console.log("SeaDex: Media ID is missing, cannot search.")
            return []
        }

        try {
            const title = media.romajiTitle || media.englishTitle || "Unknown Title"
            // Call the internal fetchTorrents method
            const seadexTorrents = await this.fetchTorrents(media.id, title)

            // Concurrently scrape and convert all torrents
            const promises = seadexTorrents.map(t => this.toAnimeTorrent(t))
            return await Promise.all(promises)
        }
        catch (error) {
            console.error("SeaDex: Error in findTorrents: " + (error as Error).message)
            return []
        }
    }

    public async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash || ""
    }

    public async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        try {
            const res = await fetch(torrent.link)
            const html = await res.text()
            const $ = LoadDoc(html)

            let magnetLink = ""

            $("a.card-footer-item, a[href^=\"magnet:\"]").each((i: number, el) => {
                const href = el.attr("href")
                if (href && href.startsWith("magnet:")) {
                    magnetLink = href
                    return false // Break the loop
                }
            })

            if (!magnetLink) {
                throw new Error("Magnet link not found on page")
            }

            return magnetLink
        }
        catch (error) {
            console.error("SeaDex: Error fetching magnet link: " + (error as Error).message)
            throw new Error("Could not fetch magnet link for: " + torrent.name)
        }
    }

    private getUri(): string {
        try {
            const customUrl = $getUserPreference("apiUrl")
            if (customUrl) {
                return customUrl
            }
        }
        catch (e) {
        }
        return this.defaultUri
    }

    private async fetchTorrents(mediaId: number, title: string): Promise<SeaDexTorrent[]> {
        let records: RecordItem[]
        try {
            records = await this.fetchRecords(mediaId)
        }
        catch (error) {
            console.error("SeaDex: Error fetching records: " + (error as Error).message)
            return []
        }

        if (!records || records.length === 0) {
            console.log("SeaDex: No records found for media ID " + mediaId)
            return []
        }

        const record = records[0]
        if (!record.expand || !record.expand.trs || record.expand.trs.length === 0) {
            console.log("SeaDex: Records found, but no torrents (expand.trs) attached.")
            return []
        }

        const torrents: SeaDexTorrent[] = []
        for (const tr of record.expand.trs) {
            if (!tr.infoHash || tr.infoHash === "<redacted>") continue
            if (tr.tracker !== "Nyaa") continue
            if (!tr.url || !tr.url.includes("nyaa.si")) continue

            const dualAudioTag = tr.dualAudio ? " [Dual-Audio]" : ""
            const name = `[${tr.releaseGroup}] ${title}${dualAudioTag}`

            const size = this.getTorrentSize(tr.files)

            torrents.push({
                name: name,
                date: tr.created,
                size: size,
                link: tr.url,
                infoHash: tr.infoHash,
                releaseGroup: tr.releaseGroup,
            })
        }

        return torrents
    }

    private async fetchRecords(mediaId: number): Promise<RecordItem[]> {
        const uri = this.getUri()
        const filter = encodeURIComponent(`alID="${mediaId}"`)
        const fullUrl = `${uri}?page=1&perPage=1&filter=${filter}&skipTotal=1&expand=trs`

        console.log("SeaDex: Fetching from " + fullUrl)

        const res = await fetch(fullUrl)
        if (!res.ok) {
            throw new Error(`API request failed with status ${res.status}: ${res.statusText}`)
        }

        const data = await res.json() as RecordsResponse
        return data.items || []
    }

    private getTorrentSize(files: TrFile[]): number {
        if (!files || files.length === 0) {
            return 0
        }

        return files.reduce((totalSize, file) => totalSize + file.length, 0)
    }

    private async toAnimeTorrent(t: SeaDexTorrent): Promise<AnimeTorrent> {
        const ret: AnimeTorrent = {
            name: t.name,
            date: t.date,
            size: t.size,
            formattedSize: "",
            seeders: -1,
            leechers: 0,
            downloadCount: 0,
            link: t.link,
            downloadUrl: "",
            infoHash: t.infoHash,
            magnetLink: "",
            resolution: "",
            isBatch: true,
            episodeNumber: -1,
            releaseGroup: t.releaseGroup || "",
            isBestRelease: true,
            confirmed: true,
        }

        try {
            const res = await fetch(t.link, { timeout: 5000 })

            if (res.ok) {
                const html = await res.text()
                const $ = LoadDoc(html)

                const title = $("h3.panel-title").first().text().trim()
                if (title) {
                    ret.name = title
                }

                let seeders = -1
                let leechers = 0
                let downloads = 0
                let formattedSize = ""

                $(".panel-body .row div.col-md-1").each((i, el) => {
                    const text = el.text().trim()
                    const valueEl = el.next()
                    if (!valueEl) return

                    const value = valueEl.text().trim()

                    if (text === "Seeders:") {
                        seeders = parseInt(value) || -1
                    } else if (text === "Leechers:") {
                        leechers = parseInt(value) || 0
                    } else if (text === "Downloads:") {
                        downloads = parseInt(value) || 0
                    } else if (text === "File size:") {
                        formattedSize = value
                    }
                })

                ret.seeders = seeders
                ret.leechers = leechers
                ret.downloadCount = downloads
                ret.formattedSize = formattedSize

                ret.downloadUrl = $("a.card-footer-item[href*='/download/']").attr("href") || ""
                if (ret.downloadUrl && !ret.downloadUrl.startsWith("http")) {
                    const url = new URL(t.link)
                    ret.downloadUrl = `${url.protocol}//${url.host}${ret.downloadUrl}`
                }
            }
        }
        catch (e) {
            console.warn("SeaDex: Failed to scrape Nyaa link for details: " + (e as Error).message)
        }

        const metadata = $habari.parse(ret.name)
        ret.resolution = metadata.video_resolution || ""
        ret.releaseGroup = t.releaseGroup || metadata.release_group || ""

        return ret
    }
}
