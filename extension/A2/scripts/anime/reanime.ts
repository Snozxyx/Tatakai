/// <reference path="./online-streaming-provider.d.ts" />

declare const Buffer: any
declare const CryptoJS: any
declare function $toBytes(value: any): Uint8Array
declare function $toString(value: any): string

type ReAnimeTitle = {
    english?: string
    native?: string
    romaji?: string
    user_preferred?: string
}

type ReAnimeSearchItem = {
    anime_id: string
    anilist_id?: number
    title?: ReAnimeTitle
    subbed?: number
    dubbed?: number
    season_year?: number
    can_watch?: boolean
}

type ReAnimeSearchResponse = {
    results?: ReAnimeSearchItem[]
    hits?: ReAnimeSearchItem[]
    total?: number
}

type ReAnimeEpisode = {
    episode_number?: number
    number?: number
    episodeId?: string
    title?: string
    titles?: string[]
}

type ReAnimeEpisodeListResponse = {
    data?: ReAnimeEpisode[]
    episodes?: ReAnimeEpisode[]
    total?: number
}

type ReAnimeEpisodeLink = {
    $id?: string
    dataType?: "sub" | "dub" | "s-sub" | "s-dub" | string
    serverName?: string
    dataLink?: string
    continue?: boolean
    softsub?: boolean
}

type ReAnimeAnimeIdentity = {
    anime_id?: string
    anilist_id?: number
}

type ReAnimeWatchResponse = {
    anime?: ReAnimeAnimeIdentity & { sub_release?: { airing_at?: string; episode?: number } }
    episode_id?: string
    episode_links?: ReAnimeEpisodeLink[]
    current?: number
    duration?: number
    progress?: { episode_id?: string }
}

type ReAnimeFlixResponse = {
    success?: boolean
    servers?: ReAnimeEpisodeLink[]
}

type ResolvedSource = {
    url: string
    subtitles: VideoSubtitle[]
    audioType?: string
    defaultAudioTrack?: number
}

type CachedResolvedSource = {
    source: ResolvedSource
    expiresAt: number
}

type FlixCloudFields = {
    keyField: string
    ivField: string
    containerName: string
    arrayName: string
    objectName: string
    tokenField: string
    keyFrag2Field: string
}

type FlixCloudCryptoData = {
    seed: string
    payload: string
    token: string
    frag1: Uint8Array
    frag2: Uint8Array
    iv: Uint8Array
}

type DecodedDataNode = {
    anime?: ReAnimeAnimeIdentity & { title?: ReAnimeTitle; subbed?: number; dubbed?: number; episodes?: number }
    episodes?: ReAnimeEpisodeListResponse
}

class Provider {

    baseUrl = "https://reanime.to"

    private _episodeCache = new Map<string, EpisodeDetails[]>()
    private _watchCache = new Map<string, ReAnimeWatchResponse>()
    private _resolvedLinkCache = new Map<string, VideoSource>()
    private _playerResultCache = new Map<string, CachedResolvedSource>()
    private _anilistIdCache = new Map<string, number>()

    getSettings(): Settings {
        return {
            // Seanime calls findEpisodeServer once per configured server. Keep a
            // single logical server and choose the best Re:ANIME source inside it;
            // otherwise Flixcloud decryption is repeated several times per click.
            episodeServers: ["default"],
            // Flixcloud exposes dub as an HLS audio track. Keep the Seanime-level
            // "Switch to dub" disabled and let the player handle audio tracks.
            supportsDub: false,
        }
    }

    private _headers(accept = "application/json,*/*"): { [key: string]: string } {
        return {
            "Accept": accept,
            "Referer": `${this.baseUrl}/`,
        }
    }

    private _title(title?: ReAnimeTitle): string {
        return title?.english || title?.user_preferred || title?.romaji || title?.native || "Unknown"
    }

    private _subOrDub(item: ReAnimeSearchItem): SubOrDub {
        const subbed = item.subbed || 0
        const dubbed = item.dubbed || 0
        if (subbed > 0 && dubbed > 0) return "both"
        if (dubbed > 0 && subbed === 0) return "dub"
        return "sub"
    }

    private async _json<T>(url: string, accept = "application/json,*/*"): Promise<T | null> {
        const res = await fetch(url, {
            credentials: "include",
            headers: this._headers(accept),
        })

        if (!res.ok) return null

        try {
            return (await res.json()) as T
        } catch {
            return null
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const queries = [
            opts.query,
            opts.media?.englishTitle,
            opts.media?.romajiTitle,
            ...(opts.media?.synonyms || []),
        ].filter((q, index, arr): q is string => !!q && arr.indexOf(q) === index)

        for (const query of queries) {
            const withYear = await this._searchQuery(query, opts.year, opts.dub)
            if (withYear.length > 0) return withYear

            if (opts.year) {
                const withoutYear = await this._searchQuery(query, undefined, opts.dub)
                if (withoutYear.length > 0) return withoutYear
            }
        }

        return []
    }

    private async _searchQuery(query: string, year?: number, preferDub = false): Promise<SearchResult[]> {
        const params = new URLSearchParams()
        params.set("q", query)
        params.set("limit", "10")
        params.set("offset", "0")
        if (year) params.set("year", String(year))

        const data = await this._json<ReAnimeSearchResponse>(`${this.baseUrl}/api/search?${params.toString()}`)
        const items = data?.results || data?.hits || []

        const results = items
            .filter(item => !!item.anime_id)
            .map(item => {
                this._rememberAnimeIdentity(item.anime_id, item)
                return {
                    id: item.anime_id,
                    title: this._title(item.title),
                    url: `${this.baseUrl}/anime/${item.anime_id}`,
                    subOrDub: this._subOrDub(item),
                }
            })

        if (!preferDub) return results

        return results.sort((a, b) => {
            const score = (result: SearchResult) => result.subOrDub === "dub" || result.subOrDub === "both" ? 0 : 1
            return score(a) - score(b)
        })
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const cached = this._episodeCache.get(id)
        if (cached) return cached

        let episodes = await this._findEpisodesViaApi(id)
        if (episodes.length === 0) {
            episodes = await this._findEpisodesViaDataRoute(id)
        }

        episodes = this._dedupeEpisodes(episodes)
        this._episodeCache.set(id, episodes)
        return episodes
    }

    private async _findEpisodesViaApi(id: string): Promise<EpisodeDetails[]> {
        const data = await this._json<ReAnimeEpisodeListResponse | ReAnimeEpisode[]>(
            `${this.baseUrl}/api/episodes/${encodeURIComponent(id)}`,
        )

        const rawEpisodes = Array.isArray(data)
            ? data
            : data?.data || data?.episodes || []
        const anilistId = await this._getAnilistId(id)

        return rawEpisodes
            .map(ep => this._toEpisodeDetails(id, ep, anilistId || undefined))
            .filter((ep): ep is EpisodeDetails => !!ep)
            .sort((a, b) => a.number - b.number)
    }

    private async _findEpisodesViaDataRoute(id: string): Promise<EpisodeDetails[]> {
        const data = await this._json<{ nodes?: { data?: unknown[] }[] }>(
            `${this.baseUrl}/anime/${encodeURIComponent(id)}/__data.json`,
        )

        const root = this._decodeSvelteData(data?.nodes?.[1]?.data) as DecodedDataNode | null
        const canonicalId = root?.anime?.anime_id || id
        this._rememberAnimeIdentity(id, root?.anime)
        const rawAnilistId = Number(root?.anime?.anilist_id)
        const anilistId = Number.isFinite(rawAnilistId) && rawAnilistId > 0 ? rawAnilistId : undefined
        const rawEpisodes = root?.episodes?.data || []
        const episodes = rawEpisodes
            .map(ep => this._toEpisodeDetails(canonicalId, ep, anilistId))
            .filter((ep): ep is EpisodeDetails => !!ep)

        // The Svelte data route may carry only the first page of episodes. If the
        // total is known, fill the missing numbers synthetically so Seanime can
        // still request a concrete episode number directly.
        const total = root?.episodes?.total || root?.anime?.episodes || 0
        if (total > episodes.length) {
            const seen = new Set(episodes.map(ep => ep.number))
            for (let number = 1; number <= total; number++) {
                if (seen.has(number)) continue
                episodes.push({
                    id: this._episodeId(canonicalId, number, anilistId),
                    number,
                    url: `${this.baseUrl}/watch/${canonicalId}?ep=${number}`,
                    title: `Episode ${number}`,
                })
            }
        }

        return episodes.sort((a, b) => a.number - b.number)
    }

    private _toEpisodeDetails(animeId: string, ep: ReAnimeEpisode, anilistId?: number): EpisodeDetails | null {
        const number = Number(ep.episode_number ?? ep.number)
        if (!Number.isFinite(number) || number <= 0 || !Number.isInteger(number)) return null

        const title = ep.title || ep.titles?.find(Boolean) || `Episode ${number}`

        return {
            id: this._episodeId(animeId, number, anilistId),
            number,
            url: `${this.baseUrl}/watch/${animeId}?ep=${number}`,
            title,
        }
    }

    private _episodeId(animeId: string, number: number, anilistId?: number): string {
        return anilistId ? `${animeId}|${number}|${anilistId}` : `${animeId}|${number}`
    }

    private _dedupeEpisodes(episodes: EpisodeDetails[]): EpisodeDetails[] {
        const byNumber = new Map<number, EpisodeDetails>()
        for (const episode of episodes) {
            if (!byNumber.has(episode.number)) byNumber.set(episode.number, episode)
        }
        return [...byNumber.values()].sort((a, b) => a.number - b.number)
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const { animeId, number, anilistId } = this._parseEpisodeId(episode)
        const cacheKey = `${animeId}|${number}`

        let candidateLinks = await this._findFlixServers(animeId, number, anilistId)

        if (candidateLinks.length === 0) {
            let watch = this._watchCache.get(cacheKey)
            if (!watch) {
                watch = await this._json<ReAnimeWatchResponse>(
                    `${this.baseUrl}/api/watch/${encodeURIComponent(animeId)}/${number}?tz=UTC`,
                ) || undefined

                if (watch) this._watchCache.set(cacheKey, watch)
            }

            if (watch?.anime) this._rememberAnimeIdentity(animeId, watch.anime)
            candidateLinks = watch?.episode_links || []
        }

        const links = this._selectLinks(candidateLinks, server)
        const videoSources: VideoSource[] = []

        for (const link of links) {
            const source = await this._toVideoSource(link)
            if (source) videoSources.push(source)
        }

        const selectedServer = links[0]?.serverName || (server === "default" ? "HD-2" : server)
        const refererOrigin = links[0]?.dataLink ? this._originOf(links[0].dataLink) : this.baseUrl

        return {
            server: selectedServer,
            headers: {
                "Referer": `${refererOrigin}/`,
                "Origin": refererOrigin,
            },
            videoSources,
        }
    }

    private _parseEpisodeId(episode: EpisodeDetails): { animeId: string; number: number; anilistId?: number } {
        const [animeId, rawNumber, rawAnilistId] = episode.id.split("|")
        if (animeId && rawNumber) {
            const anilistId = Number(rawAnilistId)
            return {
                animeId,
                number: Number(rawNumber) || episode.number,
                anilistId: Number.isFinite(anilistId) && anilistId > 0 ? anilistId : undefined,
            }
        }

        const urlMatch = episode.url.match(/\/watch\/([^/?#]+).*?[?&]ep=(\d+)/)
        if (urlMatch) {
            return { animeId: decodeURIComponent(urlMatch[1]), number: Number(urlMatch[2]) || episode.number }
        }

        return { animeId: animeId || episode.id, number: episode.number }
    }

    private async _findFlixServers(animeId: string, number: number, knownAnilistId?: number): Promise<ReAnimeEpisodeLink[]> {
        const anilistId = knownAnilistId || (await this._getAnilistId(animeId))
        if (!anilistId) return []

        const data = await this._json<ReAnimeFlixResponse>(
            `${this.baseUrl}/api/flix/${anilistId}/${number}`,
        )

        return data?.servers || []
    }

    private async _getAnilistId(animeId: string): Promise<number | null> {
        const cached = this._anilistIdCache.get(animeId)
        if (cached) return cached

        const data = await this._json<{ nodes?: { data?: unknown[] }[] }>(
            `${this.baseUrl}/anime/${encodeURIComponent(animeId)}/__data.json`,
        )

        const root = this._decodeSvelteData(data?.nodes?.[1]?.data) as DecodedDataNode | null
        this._rememberAnimeIdentity(animeId, root?.anime)

        return this._anilistIdCache.get(animeId)
            || (root?.anime?.anime_id ? this._anilistIdCache.get(root.anime.anime_id) || null : null)
    }

    private _rememberAnimeIdentity(requestedId: string, anime?: ReAnimeAnimeIdentity): void {
        const anilistId = Number(anime?.anilist_id)
        if (!Number.isFinite(anilistId) || anilistId <= 0) return

        this._anilistIdCache.set(requestedId, anilistId)
        if (anime?.anime_id) this._anilistIdCache.set(anime.anime_id, anilistId)
    }

    private _selectLinks(links: ReAnimeEpisodeLink[], server: string): ReAnimeEpisodeLink[] {
        const usable = links.filter(link => !!link.dataLink && !!link.serverName)
        if (usable.length === 0) return []

        const requested = (server || "default").toLowerCase()
        const isDefault = !server || requested === "default"
        const preferredServers = ["hd-2", "hd-1", "maze"]

        const byServer = usable.filter(link => link.serverName!.toLowerCase() === requested)
        const selected = isDefault
            ? preferredServers
                .map(name => usable.filter(link => link.serverName!.toLowerCase() === name))
                .find(group => group.length > 0) || []
            : byServer

        const fallback = selected.length > 0 ? selected : usable
        const serverScore = (name: string): number => {
            const index = preferredServers.indexOf(name.toLowerCase())
            return index === -1 ? preferredServers.length : index
        }
        const sorted = fallback.sort((a, b) => {
            const serverRank = serverScore(a.serverName!) - serverScore(b.serverName!)
            if (serverRank !== 0) return serverRank
            return this._languageRank(a.dataType) - this._languageRank(b.dataType)
        })

        // Re:ANIME often returns the same Flixcloud URL twice: one "sub" entry and
        // one "dub" entry. That is not two videos; the master HLS carries audio
        // tracks. Return each player URL once so subtitles/audio stay in one source.
        const picked: ReAnimeEpisodeLink[] = []
        const seenUrls = new Set<string>()
        for (const link of sorted) {
            const normalizedUrl = this._absoluteUrl(link.dataLink || "")
            if (seenUrls.has(normalizedUrl)) continue
            seenUrls.add(normalizedUrl)
            picked.push(link)
        }

        return picked.length > 0 ? picked : sorted.slice(0, 1)
    }

    private _languageRank(dataType?: string): number {
        if (dataType === "sub" || dataType === "s-sub") return 0
        if (dataType === "dub" || dataType === "s-dub") return 1
        return 2
    }

    private _languageLabel(dataType?: string): string {
        if (dataType === "dub" || dataType === "s-dub") return "Dub"
        if (dataType === "sub" || dataType === "s-sub") return "Sub"
        return "Unknown"
    }

    private async _toVideoSource(link: ReAnimeEpisodeLink): Promise<VideoSource | null> {
        if (!link.dataLink) return null

        const normalizedUrl = this._absoluteUrl(link.dataLink)
        const language = this._languageLabel(link.dataType)
        const quality = `${link.serverName || "Re:ANIME"} - ${language}${link.softsub ? " Softsub" : ""}`
        const cacheKey = `${normalizedUrl}|${quality}`
        const canCacheVideoSource = !this._originOf(normalizedUrl).includes("flixcloud.cc")

        const cached = canCacheVideoSource ? this._resolvedLinkCache.get(cacheKey) : undefined
        if (cached) return cached

        const resolved = await this._resolveSource(normalizedUrl)
        const sourceUrl = resolved?.url || normalizedUrl
        const isDualAudio = resolved?.audioType === "dual"
        const sourceLabel = isDualAudio ? "Dual Audio" : language
        const sourceQuality = isDualAudio
            ? `${link.serverName || "Re:ANIME"} - Dual Audio`
            : quality
        const source: VideoSource = {
            url: sourceUrl,
            type: this._videoType(sourceUrl),
            quality: sourceQuality,
            label: sourceLabel,
            subtitles: resolved?.subtitles || [],
        }

        if (canCacheVideoSource) this._resolvedLinkCache.set(cacheKey, source)
        return source
    }

    private async _resolveSource(playerUrl: string): Promise<ResolvedSource | null> {
        if (this._videoType(playerUrl) !== "unknown") return { url: playerUrl, subtitles: [] }

        const cached = this._playerResultCache.get(playerUrl)
        if (cached && cached.expiresAt > Date.now()) return cached.source
        if (cached) this._playerResultCache.delete(playerUrl)

        try {
            const res = await fetch(playerUrl, {
                credentials: "include",
                headers: this._headers("text/html,application/json,*/*"),
            })

            if (!res.ok) return null

            const contentType = this._contentType(res)
            const body = await res.text()
            let resolved: ResolvedSource | null = null

            if (contentType.includes("application/json")) {
                const direct = this._extractDirectUrlFromJson(body)
                if (direct) resolved = { url: direct, subtitles: [] }
            } else {
                const direct = this._extractDirectUrlFromHtml(body)
                if (direct) {
                    resolved = { url: direct, subtitles: [] }
                } else if (this._originOf(playerUrl).includes("flixcloud.cc")) {
                    resolved = await this._decryptFlixCloudSource(playerUrl, body)
                }
            }

            if (resolved) {
                this._playerResultCache.set(playerUrl, {
                    source: resolved,
                    expiresAt: Date.now() + 120000,
                })
            }
            return resolved
        } catch {
            return null
        }
    }

    private _contentType(res: any): string {
        const response = res as any
        if (response.contentType) return response.contentType
        if (typeof response.headers?.get === "function") return response.headers.get("content-type") || ""
        return response.headers?.["content-type"] || response.headers?.["Content-Type"] || ""
    }

    private async _decryptFlixCloudSource(playerUrl: string, html: string): Promise<ResolvedSource | null> {
        const cryptoData = await this._extractFlixCloudCryptoData(html)
        if (!cryptoData) return null

        const tokenResponse = await fetch(`${this._originOf(playerUrl)}/api/m3u8/${cryptoData.token}`, {
            credentials: "include",
            headers: {
                "Accept": "application/json,*/*",
                "Origin": this._originOf(playerUrl),
                "Referer": playerUrl,
            },
        })

        if (!tokenResponse.ok) return null

        let tokenData: Record<string, string>
        try {
            tokenData = await tokenResponse.json()
        } catch {
            return null
        }

        const videoField = this._sha256Hex(`${cryptoData.token}vid`).substring(0, 10)
        const keyField = this._sha256Hex(`${cryptoData.token}key`).substring(0, 10)
        const encryptedUrl = tokenData[videoField]
        const tokenKey = tokenData[keyField]
        if (!encryptedUrl || !tokenKey) return null

        const wasmKey = await this._runFlixCloudWasmTransform(
            cryptoData.payload,
            cryptoData.frag1,
            cryptoData.frag2,
            this._base64ToBytes(tokenKey),
            parseInt(cryptoData.seed.substring(0, 8), 16),
        )
        if (!wasmKey) return null

        const derived = this._pbkdf2Sha256(wasmKey, this._utf8Bytes(cryptoData.seed), 1000, 32)
        for (let i = 0; i < derived.length; i++) {
            derived[i] = derived[i] ^ cryptoData.seed.charCodeAt(i % cryptoData.seed.length)
        }

        const aesKey = this._sha256Bytes(derived)
        const directUrl = await this._aesCbcDecryptToString(encryptedUrl, aesKey, cryptoData.iv)
        if (!directUrl || this._videoType(directUrl) === "unknown") return null

        return {
            url: this._cleanUrl(directUrl),
            subtitles: this._extractFlixCloudSubtitles(html),
            audioType: this._extractJsStringField(html, "audio_type") || undefined,
            defaultAudioTrack: this._extractJsNumberField(html, "default_audio_track"),
        }
    }

    private _extractFlixCloudSubtitles(html: string): VideoSubtitle[] {
        const subtitles: VideoSubtitle[] = []
        const seen = new Set<string>()
        const pattern = /\{\s*url:"([^"]+)"\s*,\s*language:"([^"]+)"\s*,\s*format:"([^"]+)"\s*,\s*default:(true|false)/g
        let match: RegExpExecArray | null

        while ((match = pattern.exec(html)) !== null) {
            const url = this._cleanUrl(match[1])
            if (!url || seen.has(url)) continue
            seen.add(url)

            const language = this._cleanSubtitleLanguage(match[2])
            subtitles.push({
                id: `${language.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${subtitles.length + 1}`,
                url,
                language,
                isDefault: match[4] === "true",
            })
        }

        if (!subtitles.some(subtitle => subtitle.isDefault)) {
            const english = subtitles.find(subtitle => subtitle.language.toLowerCase().includes("english"))
            if (english) english.isDefault = true
        }

        return subtitles
    }

    private _cleanSubtitleLanguage(language: string): string {
        return language
            .replace(/\\u0028/g, "(")
            .replace(/\\u0029/g, ")")
            .replace(/\s+/g, " ")
            .trim()
    }

    private async _extractFlixCloudCryptoData(html: string): Promise<FlixCloudCryptoData | null> {
        const seed = this._extractJsStringField(html, "obfuscation_seed")
        const payload = this._extractJsStringField(html, "w_payload")
        if (!seed || !payload) return null

        const fields = await this._flixCloudFields(seed)
        const token = this._extractJsStringField(html, fields.tokenField)
        const frag1 = this._extractJsStringField(html, fields.keyField)
        const frag2 = this._extractJsStringField(html, fields.keyFrag2Field)
        const iv = this._extractJsStringField(html, fields.ivField)
        if (!token || !frag1 || !frag2 || !iv) return null

        return {
            seed,
            payload,
            token,
            frag1: this._base64ToBytes(frag1),
            frag2: this._base64ToBytes(frag2),
            iv: this._base64ToBytes(iv),
        }
    }

    private async _flixCloudFields(seed: string): Promise<FlixCloudFields> {
        let base = seed
        for (let i = 0; i < 3; i++) base = this._sha256Hex(`${base}${i}`)

        let second = base
        for (let i = 0; i < 3; i++) second = this._sha256Hex(`${second}${i}`)

        return {
            keyField: `kf_${base.substring(8, 16)}`,
            ivField: `ivf_${base.substring(16, 24)}`,
            containerName: `cd_${base.substring(24, 32)}`,
            arrayName: `ad_${base.substring(32, 40)}`,
            objectName: `od_${base.substring(40, 48)}`,
            tokenField: `${base.substring(48, 64)}_${base.substring(56, 64)}`,
            keyFrag2Field: `${second.substring(0, 16)}_${second.substring(16, 24)}`,
        }
    }

    private _extractJsStringField(html: string, field: string): string | null {
        const escaped = this._escapeRegex(field)
        const pattern = new RegExp(`(?:["']${escaped}["']|\\b${escaped}\\b)\\s*:\\s*["']([^"']+)["']`)
        return pattern.exec(html)?.[1] || null
    }

    private _extractJsNumberField(html: string, field: string): number | undefined {
        const escaped = this._escapeRegex(field)
        const pattern = new RegExp(`(?:["']${escaped}["']|\\b${escaped}\\b)\\s*:\\s*(-?\\d+)`)
        const value = Number(pattern.exec(html)?.[1])
        return Number.isFinite(value) ? value : undefined
    }

    private _escapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }

    private _extractDirectUrlFromJson(body: string): string | null {
        try {
            const data = JSON.parse(body)
            return this._deepFindVideoUrl(data)
        } catch {
            return null
        }
    }

    private _extractDirectUrlFromHtml(html: string): string | null {
        const candidates = [
            /["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/,
            /["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)["'`]/,
            /(?:file|source|src|url)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
        ]

        for (const pattern of candidates) {
            const match = html.match(pattern)
            if (match?.[1]) return this._cleanUrl(match[1])
        }

        return null
    }

    private _deepFindVideoUrl(value: unknown): string | null {
        if (typeof value === "string") {
            const clean = this._cleanUrl(value)
            return this._videoType(clean) !== "unknown" ? clean : null
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                const found = this._deepFindVideoUrl(item)
                if (found) return found
            }
            return null
        }

        if (value && typeof value === "object") {
            for (const item of Object.values(value as Record<string, unknown>)) {
                const found = this._deepFindVideoUrl(item)
                if (found) return found
            }
        }

        return null
    }

    private async _runFlixCloudWasmTransform(
        payload: string,
        frag1: Uint8Array,
        frag2: Uint8Array,
        tokenKey: Uint8Array,
        seed: number,
    ): Promise<Uint8Array | null> {
        const wasmBytes = this._base64ToBytes(payload)
        const native = await this._runNativeWasmTransform(wasmBytes, frag1, frag2, tokenKey, seed)
        if (native) return native
        return this._runInterpretedWasmTransform(wasmBytes, frag1, frag2, tokenKey, seed)
    }

    private async _runNativeWasmTransform(
        wasmBytes: Uint8Array,
        frag1: Uint8Array,
        frag2: Uint8Array,
        tokenKey: Uint8Array,
        seed: number,
    ): Promise<Uint8Array | null> {
        try {
            const webAssembly = (globalThis as any).WebAssembly
            if (!webAssembly?.instantiate) return null

            const instantiated = await webAssembly.instantiate(wasmBytes, {})
            const exports = instantiated.instance.exports
            const memory = exports.memory
            if (!memory || typeof exports._s !== "function" || typeof exports._r !== "function") return null

            if (memory.buffer.byteLength === 0) memory.grow(1)
            const heap = new Uint8Array(memory.buffer)
            const length = frag1.length
            const frag1Ptr = 1000
            const frag2Ptr = frag1Ptr + length
            const tokenKeyPtr = frag2Ptr + length
            const outputPtr = tokenKeyPtr + length

            heap.set(frag1, frag1Ptr)
            heap.set(frag2, frag2Ptr)
            heap.set(tokenKey, tokenKeyPtr)
            exports._s(seed)
            exports._r(frag1Ptr, frag2Ptr, tokenKeyPtr, outputPtr, length)

            return new Uint8Array(heap.subarray(outputPtr, outputPtr + length))
        } catch {
            return null
        }
    }

    private _runInterpretedWasmTransform(
        wasmBytes: Uint8Array,
        frag1: Uint8Array,
        frag2: Uint8Array,
        tokenKey: Uint8Array,
        seed: number,
    ): Uint8Array | null {
        const bodies = this._wasmFunctionBodies(wasmBytes)
        if (bodies.length < 2) return null

        const length = frag1.length
        const memory = new Uint8Array(4096 + length * 4)
        const frag1Ptr = 1000
        const frag2Ptr = frag1Ptr + length
        const tokenKeyPtr = frag2Ptr + length
        const outputPtr = tokenKeyPtr + length

        memory.set(frag1, frag1Ptr)
        memory.set(frag2, frag2Ptr)
        memory.set(tokenKey, tokenKeyPtr)

        const ok = this._executeWasmBody(bodies[1], [frag1Ptr, frag2Ptr, tokenKeyPtr, outputPtr, length], [seed], memory)
        if (!ok) return null

        return new Uint8Array(memory.subarray(outputPtr, outputPtr + length))
    }

    private _wasmFunctionBodies(bytes: Uint8Array): Uint8Array[] {
        const bodies: Uint8Array[] = []
        let cursor = 8

        const readUleb = (): number => {
            let result = 0
            let shift = 0
            while (cursor < bytes.length) {
                const byte = bytes[cursor++]
                result |= (byte & 0x7f) << shift
                if ((byte & 0x80) === 0) break
                shift += 7
            }
            return result
        }

        while (cursor < bytes.length) {
            const sectionId = bytes[cursor++]
            const sectionSize = readUleb()
            const sectionEnd = cursor + sectionSize

            if (sectionId === 10) {
                const functionCount = readUleb()
                for (let i = 0; i < functionCount; i++) {
                    const bodySize = readUleb()
                    bodies.push(bytes.subarray(cursor, cursor + bodySize))
                    cursor += bodySize
                }
                break
            }

            cursor = sectionEnd
        }

        return bodies
    }

    private _executeWasmBody(body: Uint8Array, params: number[], globals: number[], memory: Uint8Array): boolean {
        let pc = 0
        const readUleb = (): number => {
            let result = 0
            let shift = 0
            while (pc < body.length) {
                const byte = body[pc++]
                result |= (byte & 0x7f) << shift
                if ((byte & 0x80) === 0) break
                shift += 7
            }
            return result
        }
        const readSleb = (): number => {
            let result = 0
            let shift = 0
            let byte = 0
            do {
                byte = body[pc++]
                result |= (byte & 0x7f) << shift
                shift += 7
            } while ((byte & 0x80) !== 0)

            if (shift < 32 && (byte & 0x40) !== 0) result |= (~0 << shift)
            return result | 0
        }

        const locals = params.slice()
        const localDeclCount = readUleb()
        for (let i = 0; i < localDeclCount; i++) {
            const count = readUleb()
            pc++ // value type, always i32 for Flixcloud's tiny payload
            for (let j = 0; j < count; j++) locals.push(0)
        }

        const blockEnds = this._wasmBlockEnds(body, pc)
        const stack: number[] = []
        const controlStack: { isLoop: boolean; startPc: number; endPc: number }[] = []
        let steps = 0

        const branch = (depth: number): boolean => {
            const targetIndex = controlStack.length - 1 - depth
            if (targetIndex < 0) return false
            const frame = controlStack[targetIndex]
            if (frame.isLoop) {
                controlStack.length = targetIndex + 1
                pc = frame.startPc
            } else {
                controlStack.length = targetIndex
                pc = frame.endPc + 1
            }
            return true
        }

        while (pc < body.length && steps++ < 100000) {
            const opPc = pc
            const op = body[pc++]

            switch (op) {
                case 0x02: // block
                case 0x03: { // loop
                    pc++ // block type
                    controlStack.push({
                        isLoop: op === 0x03,
                        startPc: pc,
                        endPc: blockEnds.get(opPc) || body.length - 1,
                    })
                    break
                }
                case 0x0b: { // end
                    if (controlStack.length === 0) return true
                    controlStack.pop()
                    break
                }
                case 0x0c: { // br
                    if (!branch(readUleb())) return false
                    break
                }
                case 0x0d: { // br_if
                    const depth = readUleb()
                    const condition = stack.pop() || 0
                    if (condition !== 0 && !branch(depth)) return false
                    break
                }
                case 0x20: // local.get
                    stack.push(locals[readUleb()] | 0)
                    break
                case 0x21: // local.set
                    locals[readUleb()] = stack.pop() || 0
                    break
                case 0x23: // global.get
                    stack.push(globals[readUleb()] | 0)
                    break
                case 0x41: // i32.const
                    stack.push(readSleb())
                    break
                case 0x2d: { // i32.load8_u
                    readUleb()
                    const offset = readUleb()
                    const address = (stack.pop() || 0) + offset
                    stack.push(memory[address] || 0)
                    break
                }
                case 0x3a: { // i32.store8
                    readUleb()
                    const offset = readUleb()
                    const value = stack.pop() || 0
                    const address = (stack.pop() || 0) + offset
                    memory[address] = value & 0xff
                    break
                }
                case 0x4f: { // i32.ge_u
                    const right = (stack.pop() || 0) >>> 0
                    const left = (stack.pop() || 0) >>> 0
                    stack.push(left >= right ? 1 : 0)
                    break
                }
                case 0x6a: { // i32.add
                    const right = stack.pop() || 0
                    const left = stack.pop() || 0
                    stack.push((left + right) | 0)
                    break
                }
                case 0x6b: { // i32.sub
                    const right = stack.pop() || 0
                    const left = stack.pop() || 0
                    stack.push((left - right) | 0)
                    break
                }
                case 0x6c: { // i32.mul
                    const right = stack.pop() || 0
                    const left = stack.pop() || 0
                    stack.push(Math.imul(left, right))
                    break
                }
                case 0x71: { // i32.and
                    const right = stack.pop() || 0
                    const left = stack.pop() || 0
                    stack.push(left & right)
                    break
                }
                case 0x72: { // i32.or
                    const right = stack.pop() || 0
                    const left = stack.pop() || 0
                    stack.push(left | right)
                    break
                }
                case 0x73: { // i32.xor
                    const right = stack.pop() || 0
                    const left = stack.pop() || 0
                    stack.push(left ^ right)
                    break
                }
                case 0x74: { // i32.shl
                    const shift = (stack.pop() || 0) & 31
                    const value = stack.pop() || 0
                    stack.push(value << shift)
                    break
                }
                case 0x76: { // i32.shr_u
                    const shift = (stack.pop() || 0) & 31
                    const value = stack.pop() || 0
                    stack.push(value >>> shift)
                    break
                }
                default:
                    return false
            }
        }

        return false
    }

    private _wasmBlockEnds(body: Uint8Array, codeStart: number): Map<number, number> {
        const ends = new Map<number, number>()
        const stack: number[] = []
        let cursor = codeStart

        const readUlebAt = (): void => {
            while (cursor < body.length && (body[cursor++] & 0x80) !== 0) {
                // Skip LEB continuation bytes.
            }
        }

        while (cursor < body.length) {
            const opPc = cursor
            const op = body[cursor++]
            switch (op) {
                case 0x02:
                case 0x03:
                    cursor++ // block type
                    stack.push(opPc)
                    break
                case 0x0b:
                    if (stack.length === 0) return ends
                    ends.set(stack.pop()!, opPc)
                    break
                case 0x0c:
                case 0x0d:
                case 0x20:
                case 0x21:
                case 0x23:
                case 0x41:
                    readUlebAt()
                    break
                case 0x2d:
                case 0x3a:
                    readUlebAt()
                    readUlebAt()
                    break
                default:
                    break
            }
        }

        return ends
    }

    private async _aesCbcDecryptToString(cipherTextB64: string, key: Uint8Array, iv: Uint8Array): Promise<string | null> {
        try {
            const subtle = (globalThis as any).crypto?.subtle
            if (subtle?.importKey && subtle?.decrypt) {
                const cryptoKey = await subtle.importKey("raw", key, { name: "AES-CBC" }, false, ["decrypt"])
                const decrypted = await subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, this._base64ToBytes(cipherTextB64))
                return this._bytesToUtf8(new Uint8Array(decrypted))
            }
        } catch {
            // Fall through to Seanime's documented CryptoJS API.
        }

        try {
            if (typeof CryptoJS === "undefined") return null
            const decrypted = CryptoJS.AES.decrypt(cipherTextB64, key, { iv })
            const text = decrypted.toString(CryptoJS.enc.Utf8)
            return text || null
        } catch {
            return null
        }
    }

    private _pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number, keyLength: number): Uint8Array {
        const hashLength = 32
        const blocks = Math.ceil(keyLength / hashLength)
        const derived = new Uint8Array(blocks * hashLength)

        for (let block = 1; block <= blocks; block++) {
            const blockSalt = this._concatBytes(salt, new Uint8Array([
                (block >>> 24) & 0xff,
                (block >>> 16) & 0xff,
                (block >>> 8) & 0xff,
                block & 0xff,
            ]))
            let u = this._hmacSha256(password, blockSalt)
            const t = new Uint8Array(u)

            for (let i = 1; i < iterations; i++) {
                u = this._hmacSha256(password, u)
                for (let j = 0; j < hashLength; j++) t[j] ^= u[j]
            }

            derived.set(t, (block - 1) * hashLength)
        }

        return derived.subarray(0, keyLength)
    }

    private _hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
        let normalizedKey = key
        if (normalizedKey.length > 64) normalizedKey = this._sha256Bytes(normalizedKey)

        const keyBlock = new Uint8Array(64)
        keyBlock.set(normalizedKey)

        const outer = new Uint8Array(64)
        const inner = new Uint8Array(64)
        for (let i = 0; i < 64; i++) {
            outer[i] = keyBlock[i] ^ 0x5c
            inner[i] = keyBlock[i] ^ 0x36
        }

        return this._sha256Bytes(this._concatBytes(outer, this._sha256Bytes(this._concatBytes(inner, message))))
    }

    private _sha256Hex(value: string | Uint8Array): string {
        return this._bytesToHex(this._sha256Bytes(value))
    }

    private _sha256Bytes(value: string | Uint8Array): Uint8Array {
        const data = typeof value === "string" ? this._utf8Bytes(value) : value
        const k = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
        ]
        const paddedLength = (((data.length + 9 + 63) >> 6) << 6)
        const bytes = new Uint8Array(paddedLength)
        bytes.set(data)
        bytes[data.length] = 0x80

        const bitLengthLow = (data.length << 3) >>> 0
        const bitLengthHigh = Math.floor(data.length / 0x20000000)
        bytes[paddedLength - 8] = (bitLengthHigh >>> 24) & 0xff
        bytes[paddedLength - 7] = (bitLengthHigh >>> 16) & 0xff
        bytes[paddedLength - 6] = (bitLengthHigh >>> 8) & 0xff
        bytes[paddedLength - 5] = bitLengthHigh & 0xff
        bytes[paddedLength - 4] = (bitLengthLow >>> 24) & 0xff
        bytes[paddedLength - 3] = (bitLengthLow >>> 16) & 0xff
        bytes[paddedLength - 2] = (bitLengthLow >>> 8) & 0xff
        bytes[paddedLength - 1] = bitLengthLow & 0xff

        let h0 = 0x6a09e667
        let h1 = 0xbb67ae85
        let h2 = 0x3c6ef372
        let h3 = 0xa54ff53a
        let h4 = 0x510e527f
        let h5 = 0x9b05688c
        let h6 = 0x1f83d9ab
        let h7 = 0x5be0cd19
        const w = new Array<number>(64)

        for (let offset = 0; offset < bytes.length; offset += 64) {
            for (let i = 0; i < 16; i++) {
                const j = offset + i * 4
                w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0
            }

            for (let i = 16; i < 64; i++) {
                const s0 = this._rotr(w[i - 15], 7) ^ this._rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
                const s1 = this._rotr(w[i - 2], 17) ^ this._rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
            }

            let a = h0
            let b = h1
            let c = h2
            let d = h3
            let e = h4
            let f = h5
            let g = h6
            let h = h7

            for (let i = 0; i < 64; i++) {
                const s1 = this._rotr(e, 6) ^ this._rotr(e, 11) ^ this._rotr(e, 25)
                const ch = (e & f) ^ (~e & g)
                const temp1 = (h + s1 + ch + k[i] + w[i]) >>> 0
                const s0 = this._rotr(a, 2) ^ this._rotr(a, 13) ^ this._rotr(a, 22)
                const maj = (a & b) ^ (a & c) ^ (b & c)
                const temp2 = (s0 + maj) >>> 0

                h = g
                g = f
                f = e
                e = (d + temp1) >>> 0
                d = c
                c = b
                b = a
                a = (temp1 + temp2) >>> 0
            }

            h0 = (h0 + a) >>> 0
            h1 = (h1 + b) >>> 0
            h2 = (h2 + c) >>> 0
            h3 = (h3 + d) >>> 0
            h4 = (h4 + e) >>> 0
            h5 = (h5 + f) >>> 0
            h6 = (h6 + g) >>> 0
            h7 = (h7 + h) >>> 0
        }

        const out = new Uint8Array(32)
        const words = [h0, h1, h2, h3, h4, h5, h6, h7]
        for (let i = 0; i < words.length; i++) {
            out[i * 4] = (words[i] >>> 24) & 0xff
            out[i * 4 + 1] = (words[i] >>> 16) & 0xff
            out[i * 4 + 2] = (words[i] >>> 8) & 0xff
            out[i * 4 + 3] = words[i] & 0xff
        }
        return out
    }

    private _rotr(value: number, shift: number): number {
        return (value >>> shift) | (value << (32 - shift))
    }

    private _concatBytes(...arrays: Uint8Array[]): Uint8Array {
        const total = arrays.reduce((sum, array) => sum + array.length, 0)
        const out = new Uint8Array(total)
        let offset = 0
        for (const array of arrays) {
            out.set(array, offset)
            offset += array.length
        }
        return out
    }

    private _utf8Bytes(value: string): Uint8Array {
        try {
            if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value)
        } catch {
            // Fall through to Seanime's core API.
        }

        try {
            if (typeof $toBytes === "function") return $toBytes(value)
        } catch {
            // Fall through to a small UTF-8 encoder.
        }

        const out: number[] = []
        for (let i = 0; i < value.length; i++) {
            let codePoint = value.charCodeAt(i)
            if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < value.length) {
                const next = value.charCodeAt(i + 1)
                if (next >= 0xdc00 && next <= 0xdfff) {
                    codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00)
                    i++
                }
            }

            if (codePoint < 0x80) out.push(codePoint)
            else if (codePoint < 0x800) out.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f))
            else if (codePoint < 0x10000) out.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f))
            else out.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f))
        }
        return new Uint8Array(out)
    }

    private _bytesToUtf8(value: Uint8Array): string {
        try {
            if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(value)
        } catch {
            // Fall through to Seanime's core API.
        }

        try {
            if (typeof $toString === "function") return $toString(value)
        } catch {
            // Fall through to a simple ASCII-compatible decoder.
        }

        let out = ""
        for (let i = 0; i < value.length; i++) out += String.fromCharCode(value[i])
        return decodeURIComponent(escape(out))
    }

    private _base64ToBytes(value: string): Uint8Array {
        try {
            if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"))
        } catch {
            // Fall through to browser APIs.
        }

        const atobFn = (globalThis as any).atob
        if (typeof atobFn === "function") {
            const binary = atobFn(value)
            const out = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
            return out
        }

        return CryptoJS.enc.Base64.parse(value)
    }

    private _bytesToHex(value: Uint8Array): string {
        let out = ""
        for (let i = 0; i < value.length; i++) out += value[i].toString(16).padStart(2, "0")
        return out
    }

    private _videoType(url: string): VideoSourceType {
        const clean = url.split("?")[0].toLowerCase()
        if (clean.endsWith(".m3u8")) return "m3u8"
        if (clean.endsWith(".mp4")) return "mp4"
        return "unknown"
    }

    private _absoluteUrl(url: string): string {
        const clean = this._cleanUrl(url)
        try {
            return new URL(clean, this.baseUrl).toString()
        } catch {
            return clean
        }
    }

    private _cleanUrl(url: string): string {
        return url
            .replace(/\\\//g, "/")
            .replace(/&amp;/g, "&")
            .trim()
    }

    private _originOf(url: string): string {
        try {
            return new URL(this._absoluteUrl(url)).origin
        } catch {
            return this.baseUrl
        }
    }

    private _decodeSvelteData(data?: unknown[]): unknown {
        if (!data || data.length === 0) return null

        const memo: Record<number, unknown> = {}

        const hydrate = (index: unknown): unknown => {
            if (typeof index !== "number") return index
            if (Object.prototype.hasOwnProperty.call(memo, index)) return memo[index]

            const value = data[index]

            if (Array.isArray(value)) {
                const out: unknown[] = []
                memo[index] = out
                for (const ref of value) out.push(hydrate(ref))
                return out
            }

            if (value && typeof value === "object") {
                const out: Record<string, unknown> = {}
                memo[index] = out
                for (const [key, ref] of Object.entries(value as Record<string, unknown>)) {
                    out[key] = hydrate(ref)
                }
                return out
            }

            return value
        }

        return hydrate(0)
    }
}
