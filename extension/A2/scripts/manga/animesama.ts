/**
 * Seanime Extension for Anime-Sama
 * Implements MangaProvider interface for 'https://anime-sama.store'.
 */
class Provider {

    constructor() {
        this.api = 'https://anime-sama.store';
        this.s2 = 'https://anime-sama.store/s2/scans';
        this.imgCdn = 'https://raw.githubusercontent.com/Anime-Sama/IMG/img/contenu';
        this.lang = 'vf';
    }

    api = '';
    s2 = '';
    imgCdn = '';
    lang = '';

    getSettings() {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        };
    }

    async search(opts) {
        const query = opts.query;
        const url = `${this.api}/ajax/search.php`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Origin': this.api,
                    'Referer': `${this.api}/`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: `query=${encodeURIComponent(query)}`,
            });

            if (!response.ok) return [];

            const html = await response.text();

            // Parse <a href="/catalogue/..."> blocks from the HTML response
            const results = [];
            const anchorRegex = /<a\s+href="\/catalogue\/([^"]+)"[^>]*class="asn-search-result"[^>]*>([\s\S]*?)<\/a>/g;
            let match;

            while ((match = anchorRegex.exec(html)) !== null) {
                const slug = match[1];
                const inner = match[2];

                // Extract cover image src
                const imgMatch = inner.match(/<img[^>]+src="([^"]+)"/);
                const image = imgMatch ? imgMatch[1] : undefined;

                // Extract title
                const titleMatch = inner.match(/<h3[^>]*class="asn-search-result-title"[^>]*>([^<]+)<\/h3>/);
                const title = titleMatch ? titleMatch[1].trim() : slug;

                // Extract subtitle / synonym
                const subtitleMatch = inner.match(/<p[^>]*class="asn-search-result-subtitle"[^>]*>([^<]+)<\/p>/);
                const subtitle = subtitleMatch ? subtitleMatch[1].trim() : undefined;

                results.push({
                    id: slug,
                    title: title,
                    synonyms: subtitle ? [subtitle] : undefined,
                    image: image,
                });
            }

            return results;
        } catch (e) {
            return [];
        }
    }

    async findChapters(mangaId) {
        // mangaId is the slug, e.g. "horimiya"
        // First verify the catalogue page has a Manga section and determine lang
        try {
            const catalogueUrl = `${this.api}/catalogue/${mangaId}`;
            const pageResponse = await fetch(catalogueUrl, {
                headers: {
                    'Referer': `${this.api}/`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                },
            });

            if (!pageResponse.ok) return [];

            const pageHtml = await pageResponse.text();

            // Detect available scan language — prefer vf, fall back to vostfr
            let lang = null;
            if (pageHtml.includes(`/catalogue/${mangaId}/scan/vf`)) {
                lang = 'vf';
            } else if (pageHtml.includes(`/catalogue/${mangaId}/scan/vostfr`)) {
                lang = 'vostfr';
            }

            // No manga section found
            if (!lang) return [];

            // Fetch chapter count map: { "1": numPages, "2": numPages, ... }
            const chapUrl = `${this.s2}/get_nb_chap_et_img.php?oeuvre=${encodeURIComponent(mangaId)}&lang=${lang}`;
            const chapResponse = await fetch(chapUrl, {
                headers: {
                    'Referer': `${this.api}/`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                },
            });

            if (!chapResponse.ok) return [];

            const chapMap = await chapResponse.json();

            // chapMap keys are chapter numbers as strings
            const chapters = Object.keys(chapMap).map((chapNum, i) => ({
                // Encode slug, lang and chapter number so findChapterPages can reconstruct the URL
                id: `${mangaId}|${lang}|${chapNum}`,
                url: `${this.api}/catalogue/${mangaId}/scan/${lang}/${chapNum}`,
                title: `Chapter ${chapNum}`,
                chapter: chapNum,
                index: i,
            }));

            // Sort numerically ascending
            chapters.sort((a, b) => parseFloat(a.chapter) - parseFloat(b.chapter));
            chapters.forEach((c, i) => { c.index = i; });

            return chapters;
        } catch (e) {
            return [];
        }
    }

    async findChapterPages(chapterId) {
        // chapterId is "slug|lang|chapNum"
        const parts = chapterId.split('|');
        const mangaId = parts[0];
        const lang = parts[1];
        const chapNum = parts[2];

        const url = `${this.s2}/get_pages.php?oeuvre=${encodeURIComponent(mangaId)}&chap=${chapNum}&lang=${lang}`;
        const referer = `${this.api}/catalogue/${mangaId}/scan/${lang}/${chapNum}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Referer': referer,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                },
            });

            if (!response.ok) return [];

            const pages = await response.json();

            // Response: [{ "page": 1, "url": "https://..." }, ...]
            return pages.map((p) => ({
                url: p.url,
                index: p.page - 1,
                headers: { 'Referer': referer },
            }));
        } catch (e) {
            return [];
        }
    }
}
    