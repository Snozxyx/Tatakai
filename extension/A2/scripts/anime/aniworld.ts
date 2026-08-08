/// <reference path="./online-streaming-provider.d.ts" />

class Provider {
  constructor() {
    this.base = "https://aniworld.to";
  }

  getSettings() {
    return {
      episodeServers: ["VidMoly"],
      supportsDub: true,
    };
  }

  async search(query) {
    try {
      const seasonMatch = query.query.match(/season\s+(\d+)/i);
      const movieMatch = query.query.match(/\bmovie\b/i);
      
      const cleanQuery = query.query
        .replace(/season\s+\d+/i, "")
        .replace(/\bmovie\b/i, "")
        .trim();

      let suffix = "";
      if (seasonMatch) suffix = `|season:${seasonMatch[1]}`;
      else if (movieMatch) suffix = `|movie`;
      
      if (query.dub) suffix += "|dub";

      const res = await fetch(`${this.base}/ajax/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": `${this.base}/`,
        },
        body: `keyword=${encodeURIComponent(cleanQuery)}`,
      });

      const text = await res.text();
      if (!text || text.startsWith("<!DOCTYPE")) return [];

      const data = JSON.parse(text);
      if (!Array.isArray(data)) return [];

      return data
        .filter(item => item.link && item.link.startsWith("/anime/stream/"))
        .map(item => ({
          id: item.link.replace("/anime/stream/", "") + suffix,
          title: item.title.replace(/<\/?[^>]+(>|$)/g, "").replace(/&#8230;/g, "..."),
          url: `${this.base}${item.link}`,
          subOrDub: query.dub ? "dub" : "sub", 
        }));
    } catch (e) {
      return [];
    }
  }

  async findEpisodes(id) {
    const parts = id.split("|");
    const slug = parts[0];
    const isMovie = parts.includes("movie");
    const seasonPart = parts.find(p => p.startsWith("season:"));
    const isDub = parts.includes("dub");

    let url = `${this.base}/anime/stream/${slug}`;

    // 1. Resolve correct sub-page
    if (isMovie || seasonPart) {
      const res = await fetch(url);
      const html = await res.text();

      if (seasonPart) {
        const seasonNumber = seasonPart.split(":")[1];
        const seasonRegex = new RegExp(`href="([^"]+\/staffel-${seasonNumber})"[^>]*>\\s*${seasonNumber}\\s*<\/a>`, "i");
        const match = html.match(seasonRegex);
        if (match) url = `${this.base}${match[1]}`;
      } 
      else if (isMovie) {
        const movieRegex = /href="([^"]+\/filme)"[^>]*>Filme<\/a>/i;
        const match = html.match(movieRegex);
        if (match) url = `${this.base}${match[1]}`;
        else return []; // No "Filme" section available
      }
    }

    const res = await fetch(url);
    const html = await res.text();

    if (isMovie) {
      // 2. Strict Movie Scraper
      const movieRowRegex = /<tr[^>]*data-episode-id="(\d+)"[^>]*>.*?<td class="seasonEpisodeTitle"><a href="([^"]+)">\s*<strong>(.*?)<\/strong>\s*(?:-?\s*<span>(.*?)<\/span>)?.*?<i class="icon Vidmoly"/gs;
      
      let allMovies = [];
      let match;
      while ((match = movieRowRegex.exec(html)) !== null) {
        const [_, epId, epUrl, strongTitle, spanTitle] = match;
        const rawSpan = spanTitle || "";
        const fullTitleText = (strongTitle + " " + rawSpan).toLowerCase();

        // Check if this row is actually a movie/the main feature
        const isLikelyMovie = fullTitleText.includes("movie") || fullTitleText.includes("film");

        if (isLikelyMovie) {
          let cleanTitle = (strongTitle.trim() || rawSpan.trim() || "Movie")
            .replace(/\[movie\]/i, "").replace(/\[ova\]/i, "").trim();

          allMovies.push({
            id: epId + (isDub ? "|dub" : ""),
            title: cleanTitle,
            number: 1,
            url: `${this.base}${epUrl}`,
          });
        }
      }

      // Return only the first matching movie entry, or nothing if none found
      return allMovies.length > 0 ? [allMovies[0]] : [];

    } else {
      // 3. Standard Episode Scraper
      const epRegex = /<tr[^>]*data-episode-id="(\d+)"[^>]*>.*?<meta itemprop="episodeNumber" content="(\d+)".*?<a itemprop="url" href="([^"]+)">/gs;
      const episodes = [];
      let match;
      while ((match = epRegex.exec(html)) !== null) {
        episodes.push({
          id: match[1] + (isDub ? "|dub" : ""),
          title: `Episode ${match[2]}`,
          number: parseInt(match[2]),
          url: `${this.base}${match[3]}`,
        });
      }
      return episodes;
    }
  }

  async findEpisodeServer(episode, _server) {
    const res = await fetch(episode.url);
    const html = await res.text();

    const isDub = episode.id.includes("|dub");
    const priority = isDub ? ["1"] : ["3", "1", "2"];

    let redirectUrl = null;
    const liBlocks = html.split(/<li/g);

    for (const key of priority) {
      for (const block of liBlocks) {
        if (block.includes(`data-lang-key="${key}"`) && block.toLowerCase().includes('icon vidmoly')) {
          const urlMatch = block.match(/data-link-target="([^"]+)"/);
          if (urlMatch) {
            redirectUrl = `${this.base}${urlMatch[1]}`;
            break;
          }
        }
      }
      if (redirectUrl) break;
    }

    if (!redirectUrl) throw new Error("Source not available for requested language.");

    const hosterRes = await fetch(redirectUrl);
    const hosterHtml = await hosterRes.text();

    const m3u8Regex = /file\s*:\s*["'](https?:\/\/[^"']+\/master\.m3u8[^"']*)["']/;
    const fileMatch = hosterHtml.match(m3u8Regex);

    const videoUrl = fileMatch ? fileMatch[1] : (hosterHtml.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/)?.[1]);
    if (!videoUrl) throw new Error("M3U8 not found.");

    return {
      server: "VidMoly",
      videoSources: [{ url: videoUrl, quality: "auto", type: "hls" }],
    };
  }
}
