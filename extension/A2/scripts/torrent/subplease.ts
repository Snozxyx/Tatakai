/// <reference path="./anime-torrent-provider.d.ts" />
/// <reference path="./core.d.ts" />

// Defines the structure of a single download link from the API
type SubsPleaseDownload = {
    res: string;
    magnet: string;
};

// Defines the structure of a single release from the API
type SubsPleaseRelease = {
    show: string;
    episode: string;
    downloads: SubsPleaseDownload[];
    release_date: string;
    page: string;
};

class Provider {

    private api = "https://subsplease.org/api/";

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["episodeNumber", "resolution"],
            supportsAdult: false,
            type: "main",
        };
    }

    async getLatest(): Promise<AnimeTorrent[]> {
        return await this.fetchAndParseSearchResults("");
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        return await this.fetchAndParseSearchResults(opts.query);
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        if (opts.batch) {
            return []; // SubsPlease API does not reliably support batch searches.
        }

        const query = opts.query || opts.media.romajiTitle || opts.media.englishTitle || "";
        const allTorrents = await this.fetchAndParseSearchResults(query);
        
        let filtered = allTorrents;

        if (opts.episodeNumber > 0) {
            const absoluteEpisode = opts.media.absoluteSeasonOffset + opts.episodeNumber;
            filtered = filtered.filter(t => 
                !t.isBatch && (t.episodeNumber === opts.episodeNumber || t.episodeNumber === absoluteEpisode)
            );
        }

        // CRITICAL FIX: Robust resolution filtering
        if (opts.resolution) {
            // Normalize the target resolution (e.g., "1080p" -> 1080)
            const targetRes = parseInt(opts.resolution.replace('p', ''), 10);
            if (!isNaN(targetRes)) {
                filtered = filtered.filter(t => {
                    // Normalize the torrent's resolution and compare
                    const torrentRes = parseInt(t.resolution.replace('p', ''), 10);
                    return torrentRes === targetRes;
                });
            }
        }
        
        return filtered;
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return torrent.magnetLink || "";
    }

    private async fetchAndParseSearchResults(query: string): Promise<AnimeTorrent[]> {
        const searchUrl = `${this.api}?f=search&tz=UTC&s=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch from SubsPlease API, status: ${response.status}`);
        }

        const data = await response.json() as { [key: string]: SubsPleaseRelease };
        const torrents: AnimeTorrent[] = [];

        if (data && typeof data === 'object') {
            for (const key in data) {
                const release = data[key];
                if (release.episode !== "Batch") {
                    torrents.push(...this.apiReleaseToAnimeTorrents(release));
                }
            }
        }
        return torrents;
    }
    
    private apiReleaseToAnimeTorrents(release: SubsPleaseRelease): AnimeTorrent[] {
        const torrents: AnimeTorrent[] = [];
        const episodeNumber = parseInt(release.episode, 10);
        
        const parsedDate = new Date(release.release_date);
        const date = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();

        for (const download of release.downloads) {
            const resolution = download.res + "p";
            const sizeInBytes = this.getSizeFromMagnet(download.magnet);
            const name = `[SubsPlease] ${release.show} - ${String(episodeNumber).padStart(2, '0')} (${resolution}) [${this.getHashFromMagnet(download.magnet)}].mkv`;

            torrents.push({
                name: name,
                date: date,
                size: sizeInBytes,
                formattedSize: sizeInBytes > 0 ? `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB` : "N/A",
                seeders: -1,
                leechers: -1,
                downloadCount: 0,
                link: `https://subsplease.org/shows/${release.page}/`,
                downloadUrl: "",
                magnetLink: download.magnet,
                infoHash: this.getHashFromMagnet(download.magnet),
                resolution: resolution,
                isBatch: false,
                episodeNumber: isNaN(episodeNumber) ? -1 : episodeNumber,
                releaseGroup: "SubsPlease",
                isBestRelease: false,
                confirmed: true,
            });
        }
        return torrents;
    }
    
    private getHashFromMagnet(magnet: string): string {
        const match = magnet.match(/btih:([a-zA-Z0-9]+)/);
        return match ? match[1].toUpperCase() : "";
    }

    private getSizeFromMagnet(magnet: string): number {
        const match = magnet.match(/xl=(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }
}
