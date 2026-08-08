/// <reference path="./online-streaming-provider.d.ts" />

class Provider {
    baseUrl = "https://senshi.live"
  
    getSettings(): Settings {
        return {
            episodeServers: ["default"],
            supportsDub: true,
        }
    }
  
    async search(query: SearchOptions): Promise<SearchResult[]> {
        const response = await fetch(`${this.baseUrl}/anime/filter`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                searchTerm: query.query,
                page: 1,
                limit: 5,
            }),
        })
        if (!response.ok) {
            return []
        }
        const json = await response.json()
        const data = json?.data ?? json
        if (!Array.isArray(data)) {
            return []
        }
        return data.map((item: any) => ({
            id: `${item.id}/${query.dub ? "dub" : "sub"}`,
            title: item.title_english || item.title || "",
            url: `${this.baseUrl}/anime/${item.public_id}`,
            subOrDub: query.dub ? "dub" : "sub",
        }))
    }
  
    async findEpisodes(Id: string): Promise<EpisodeDetails[]> {
        const [id, lang] = Id.split("/")
        const response = await fetch(`${this.baseUrl}/episodes/${id}`)
        if (!response.ok) {
            return []
        }
        const data: any[] = await response.json()
        if (!Array.isArray(data)) {
            return []
        }
        return data.map((ep: any) => ({
            id: `${ep.mal_id}/${lang}`,
            number: ep.ep_id,
            url: `${this.baseUrl}/episode-embeds/${ep.mal_id}/${ep.ep_id}`,
            title: ep.ep_title || `Episode ${ep.ep_id}`,
        }))
    }
  
    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const [id, lang] = episode.id.split("/")

        const response = await fetch(episode.url)
        if (!response.ok) {
            return {
                server: _server || "default",
                headers: {},
                videoSources: [],
            }
        }
        const data: any[] = await response.json()
        if (!Array.isArray(data)) return

        const filtered = lang === "dub"
            ? data.filter((source: any) => source.status === "Dub")
            : data.filter((source: any) => source.status === "HardSub")

        if (filtered.length === 0) return

        const videoSources: VideoSource[] = filtered
            .filter((source: any) => source.url)
            .map((source: any) => {
                const url: string = source.url
                const type = url.includes(".m3u8") ? "m3u8" : "mp4"
                return {
                    url,
                    type: type as "m3u8" | "mp4",
                    quality: "auto",
                    subtitles: [],
                }
            })

        return {
            server: "default",
            headers: {
                "Referer": this.baseUrl
            },
            videoSources,
        }
    }
}