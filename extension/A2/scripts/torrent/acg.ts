/// <reference path="./anime-torrent-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {

    private api = "https://acg.rip"

    // Returns the provider settings.
    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: false,
            smartSearchFilters: [],
            supportsAdult: true,
            type: "main",
        }
    }

    // Searches for torrents based on the user's query.
    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const searchUrl = `${this.api}/?term=${encodeURIComponent(opts.query)}`;

        const response = await fetch(searchUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch search results from acg.rip, status: ${response.status}`);
        }
        const html = await response.text();
        
        return this.parseResults(html);
    }

    // Get the latest torrents from the homepage.
    async getLatest(): Promise<AnimeTorrent[]> {
        const response = await fetch(this.api);
        if (!response.ok) { return []; }
        const html = await response.text();
        
        return this.parseResults(html);
    }

    // Main parsing function for both search and latest results.
    private parseResults(html: string): AnimeTorrent[] {
        const $ = LoadDoc(html);
        const torrents: AnimeTorrent[] = [];

        $("table.post-index > tbody > tr").each((i, el) => {
            const titleElement = el.find("td.title > span.title > a");
            const dateElement = el.find("td.date time");
            const sizeElement = el.find("td.size");
            const downloadElement = el.find("td.action > a");
            const releaseGroupElement = el.find("td.title > span.label-team > a");

            let name = titleElement.text().trim();
            let releaseGroup = releaseGroupElement.text().trim();
            
            // --- NEW LOGIC TO PARSE RELEASE GROUP FROM TITLE ---
            // If we didn't find a release group from the special tag, try to parse it from the title.
            if (!releaseGroup && name.startsWith('[')) {
                const match = name.match(/^\[([^\]]+)\]/);
                if (match && match[1]) {
                    releaseGroup = match[1];
                    // Remove the group from the beginning of the title
                    name = name.substring(match[0].length).trim();
                }
            }

            const link = this.api + titleElement.attr("href");
            const downloadUrl = this.api + downloadElement.attr("href");
            const sizeStr = sizeElement.text().trim();
            const timestamp = dateElement.attr("datetime");

            torrents.push({
                name: name,
                date: this.parseDate(timestamp),
                size: this.parseSize(sizeStr),
                formattedSize: sizeStr,
                seeders: -1,
                leechers: -1,
                downloadCount: 0,
                link: link,
                downloadUrl: downloadUrl,
                releaseGroup: releaseGroup,
                magnetLink: "", 
                infoHash: "",
                resolution: this.parseResolution(name),
                isBatch: false,
                episodeNumber: -1,
                isBestRelease: false,
                confirmed: false,
            });
        });

        return torrents;
    }

    // This provider does not support smart search.
    async smartSearch(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        return [];
    }
    
    // This function downloads the .torrent file and converts it to a magnet link.
    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        try {
            const response = await fetch(torrent.downloadUrl);
            if (!response.ok) {
                console.error("Failed to download .torrent file");
                return "";
            }
            const torrentData = await response.text();
            
            const magnetLink = $torrentUtils.getMagnetLinkFromTorrentData(torrentData);
            return magnetLink || "";

        } catch (error) {
            console.error("Error creating magnet link from .torrent file:", error);
            return "";
        }
    }

    private parseResolution(title: string): string {
        const match = title.match(/\b(\d{3,4}p)\b/i);
        return match ? match[1] : "";
    }

    private parseSize(sizeStr: string): number {
        const sizeMatch = sizeStr.match(/([\d\.]+)\s*(GB|MB|KB)/i);
        if (!sizeMatch) return 0;
        const size = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2].toUpperCase();
        if (unit === "GB") { return Math.round(size * 1024 * 1024 * 1024); }
        if (unit === "MB") { return Math.round(size * 1024 * 1024); }
        if (unit === "KB") { return Math.round(size * 1024); }
        return 0;
    }

    private parseDate(timestamp: string): string {
        if (!timestamp) return "";
        const date = new Date(parseInt(timestamp) * 1000);
        return date.toISOString();
    }
}
