/// <reference path="../typing/manga-provider.d.ts" />

class Provider {
    private api: string = "https://3asq.org"
    private userAgent: string = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    private async fetch(url: string, opts: RequestInit = {}): Promise<Response> {
        return fetch(url, {
            ...opts,
            headers: {
                "User-Agent": this.userAgent,
                "Referer": this.api + "/",
                "X-Requested-With": "XMLHttpRequest",
                ...opts.headers,
            }
        })
    }

    // Search for manga based on a query. Returns a list of search results.
    async search({ query }: QueryOptions): Promise<SearchResult[]> {
        const url = `${this.api}/?s=${encodeURIComponent(query)}&post_type=wp-manga`
        const resp = await this.fetch(url)
        const html = await resp.text()
        const $ = LoadDoc(html)

        const resultsMap = new Map<string, SearchResult>()

        $(".c-tabs-item__content, .tab-content-wrap, .c-tabs-item, .row.c-tabs-item__content").each((i: number, el: any) => {
            const titleAnchor = el.find(".post-title h3 a, .post-title h4 a, .post-title a").first()
            if (titleAnchor.length() === 0) return

            const title = titleAnchor.text().trim()
            const href = titleAnchor.attr("href")
            if (!href) return

            const slugMatch = href.match(/\/manga\/([^/]+)\//)
            if (!slugMatch) return
            const slug = slugMatch[1]

            // Avoid duplicates
            if (resultsMap.has(slug)) return

            const imgEl = el.find("img")
            const image = imgEl.attr("data-src")?.trim() || 
                          imgEl.attr("data-lazy-src")?.trim() || 
                          imgEl.attr("src")?.trim()

            resultsMap.set(slug, {
                id: slug,
                title: title,
                image: image
            })
        })

        return Array.from(resultsMap.values())
    }

    // Returns the chapters based on the manga ID (slug).
    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        const mangaUrl = `${this.api}/manga/${mangaId}/`
        const resp = await this.fetch(mangaUrl)
        const html = await resp.text()
        let $ = LoadDoc(html)

        let chapters: ChapterDetails[] = []
        
        // 1. Try SSR Chapters
        chapters = this.parseChapters($, mangaId)

        // 2. AJAX Fallback
        if (chapters.length === 0) {
            const postIdMatch = html.match(/postid-(\d+)/) || html.match(/data-id="(\d+)"/)
            if (postIdMatch) {
                const postId = postIdMatch[1]
                
                // Try standard AJAX first
                const ajaxUrl = `${this.api}/wp-admin/admin-ajax.php`
                const ajaxResp = await this.fetch(ajaxUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: `action=manga_get_chapters&manga=${postId}`
                })
                const ajaxHtml = await ajaxResp.text()
                
                if (ajaxHtml.length > 5 && ajaxHtml !== "0") {
                    const $ajax = LoadDoc(ajaxHtml)
                    chapters = this.parseChapters($ajax, mangaId)
                } else {
                    // Try direct AJAX URL fallback
                    const directAjaxUrl = `${this.api}/manga/${mangaId}/ajax/chapters/`
                    const directResp = await this.fetch(directAjaxUrl, { method: "POST" })
                    const directHtml = await directResp.text()
                    const $direct = LoadDoc(directHtml)
                    chapters = this.parseChapters($direct, mangaId)
                }
            }
        }

        // Final sorting
        chapters.reverse()
        chapters.forEach((chapter, index) => {
            chapter.index = index
        })

        return chapters
    }

    private parseChapters($: any, mangaId: string): ChapterDetails[] {
        const chapters: ChapterDetails[] = []
        $(".wp-manga-chapter, .chapter-li, .listing-chapters_wrap li").each((i: number, el: any) => {
            const a = el.find("a").first()
            const href = a.attr("href")
            if (!href) return

            if (!href.includes(mangaId)) return

            const slugMatch = href.match(/\/manga\/[^/]+\/([^/]+)\//)
            if (!slugMatch) return
            const chapterSlug = slugMatch[1]
            const title = a.text().trim() || chapterSlug

            chapters.push({
                id: `${mangaId}$${chapterSlug}`,
                url: href,
                title: title,
                chapter: chapterSlug,
                index: 0
            })
        })
        return chapters
    }

    // Returns the chapter pages based on the chapter ID.
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const [mangaId, chapterSlug] = chapterId.split("$")
        const url = `${this.api}/manga/${mangaId}/${chapterSlug}/`
        const resp = await this.fetch(url)
        const html = await resp.text()
        const $ = LoadDoc(html)

        const pages: ChapterPage[] = []

        $(".wp-manga-chapter-img").each((i: number, el: any) => {
            const src = el.attr("data-src")?.trim() || 
                        el.attr("data-lazy-src")?.trim() || 
                        el.attr("src")?.trim()
            if (src) {
                pages.push({
                    url: src,
                    index: i,
                    headers: {
                        "Referer": this.api + "/"
                    }
                })
            }
        })

        return pages
    }

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }
}
