class Provider {
  constructor() {
    this.api = "https://asurascans.com";
    this.SLUG_SUFFIX = "f6174291"; // constant suffix used in all comic URLs
  }

  getSettings() {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  async fetchWithHeaders(url) {
    return fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        Accept: "*/*",
        Referer: this.api,
      },
    });
  }

  async search(opts) {
    const url = `${this.api}/browse?search=${encodeURIComponent(opts.query)}`;
    try {
      const response = await this.fetchWithHeaders(url);
      if (!response.ok) return [];
      const html = await response.text();

      const props = this._extractAstroProps(html, "BrowseFilters");
      if (!props) {
        console.error("Could not find BrowseFilters props");
        return [];
      }

      const initialSeries = props["initialSeries"];
      if (!initialSeries || initialSeries[0] !== 1) return [];

      const mangas = [];
      for (const entry of initialSeries[1]) {
        if (!Array.isArray(entry) || entry[0] !== 0) continue;
        const s = entry[1];

        const slug = this._astroVal(s["slug"]);
        const title = this._astroVal(s["title"]);
        const cover = this._astroVal(s["cover"]);

        if (!slug) continue;

        mangas.push({
          id: slug,
          title: title || slug,
          image: cover || "",
        });
      }

      return mangas;
    } catch (e) {
      console.error("Search error:", e);
      return [];
    }
  }

  async findChapters(mangaId) {
    // mangaId is the slug e.g. "solo-leveling-ragnarok"
    // Comic page URL is always: /comics/{slug}-{SLUG_SUFFIX}
    const comicUrl = `${this.api}/comics/${mangaId}-${this.SLUG_SUFFIX}`;
    try {
      const response = await this.fetchWithHeaders(comicUrl);
      if (!response.ok) return [];
      const html = await response.text();

      const chapters = [];
      const seen = new Set();

      // Chapter links: href="/comics/{full-slug}/chapter/{num}"
      const chapterRegex = /href="(\/comics\/[^"]+\/chapter\/([^"]+))"/gi;
      let match;
      while ((match = chapterRegex.exec(html)) !== null) {
        const fullPath = match[1];
        const chapterNum = match[2];

        if (seen.has(chapterNum)) continue;
        seen.add(chapterNum);

        chapters.push({
          id: `${this.api}${fullPath}`,
          title: `Chapter ${chapterNum}`,
          chapter: chapterNum,
        });
      }

      return chapters.sort((a, b) => parseFloat(a.chapter) - parseFloat(b.chapter));
    } catch (e) {
      console.error("findChapters error:", e);
      return [];
    }
  }

  async findChapterPages(chapterUrl) {
    try {
      const response = await this.fetchWithHeaders(chapterUrl);
      if (!response.ok) return [];
      const html = await response.text();

      const props = this._extractAstroProps(html, "ChapterReader");
      if (!props) {
        console.error("Could not find ChapterReader props");
        return [];
      }

      // pages -> [1, [ [0, {url, width, height}], ... ]]
      const pagesData = props["pages"];
      if (!pagesData || pagesData[0] !== 1) {
        console.error("No pages data found in props");
        return [];
      }

      const pages = [];
      for (let i = 0; i < pagesData[1].length; i++) {
        const entry = pagesData[1][i];
        if (!Array.isArray(entry) || entry[0] !== 0) continue;
        const p = entry[1];

        const pageUrl = this._astroVal(p["url"]);
        if (!pageUrl) continue;

        pages.push({
          url: pageUrl,
          index: i,
          headers: { Referer: this.api },
        });
      }

      return pages;
    } catch (e) {
      console.error("findChapterPages error:", e);
      return [];
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  // Extract and parse the props JSON from a named astro-island component.
  _extractAstroProps(html, componentName) {
    const regex = new RegExp(
      `component-export="default"[^>]*props="([^"]+)"[^>]*ssr[^>]*client="load"[^>]*opts="[^"]*${componentName}`
    );
    const match = regex.exec(html);
    if (!match) return null;

    const propsJson = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    try {
      return JSON.parse(propsJson);
    } catch (e) {
      console.error(`Failed to parse ${componentName} props:`, e);
      return null;
    }
  }

  // Decode Astro's [type, value] encoded primitive. type 0 = scalar, type 1 = array.
  _astroVal(encoded) {
    if (!Array.isArray(encoded)) return encoded;
    const [type, value] = encoded;
    if (type === 0) return value;
    if (type === 1) return value.map(v => this._astroVal(v));
    return value;
  }
}
