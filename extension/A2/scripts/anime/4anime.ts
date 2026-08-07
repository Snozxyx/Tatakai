/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {
    base = "https://4anime.gg";
    api = "https://4anime.gg/ajax";
  
    getSettings(): Settings {
      return {
        episodeServers: ["Vidstreaming", "Vidcloud", "DouVideo"],
        supportsDub: true,
      };
    }
  
    async search(opts: SearchOptions): Promise<SearchResult[]> {
      const req = await fetch(
        `${this.api}/search/suggest?keyword=${encodeURIComponent(opts.query)}`,
        {
          headers: {
            Referer: "https://4anime.gg/",
          },
        },
      );
  
      if (!req.ok) return [];
  
      const data = (await req.json()) as { status: boolean; html: string };
      if (!data?.html) return [];
  
      const $ = LoadDoc(data.html);
      const results: SearchResult[] = [];
  
      $("div.item").map((_, el) => {
        const link = el
          .children("div.anime_info")
          .children("h3.anime_name")
          .children("a");
  
        const title = link.text().trim();
        const url = link.attr("href") || "";
  
        const slug = url.split("/").pop()?.split("?")[0] || "";
        const id = slug.split("-").pop() || "";
  
        results.push({
          subOrDub: opts.dub ? "dub" : "sub",
          id: `${id}/${opts.dub ? "dub" : "sub"}`,
          title,
          url: `${this.base}${url}`,
        });
      });
  
      return results;
    }
  
    async findEpisodes(arg: string): Promise<EpisodeDetails[]> {
      const [animeid, subOrDub] = arg.split("/");
  
      const req = await fetch(`${this.api}/episode/list/${animeid}`, {
        headers: {
          Referer: this.base,
        },
      });
  
      if (!req.ok) return [];
  
      const data = (await req.json()) as { status: boolean; html: string };
      if (!data?.html) return [];
  
      const $ = LoadDoc(data.html);
      const episodes: EpisodeDetails[] = [];
  
      $("li.ep-item").map((_, el) => {
        const epId = el.attr("data-id") || "";
  
        const link = el.children("a");
  
        const number = parseInt(link.text().trim()) || 0;
        const url = this.base + (link.attr("href") || "");
  
        episodes.push({
          id: `${epId}/${subOrDub ?? "sub"}`,
          number,
          url,
          title: `Episode ${number}`,
        });
      });
  
      // just in case order is weird
      episodes.sort((a, b) => a.number - b.number);
  
      return episodes;
    }
  
    async findEpisodeServer(
      episode: EpisodeDetails,
      _server: string,
    ): Promise<EpisodeServer> {
      const [episodeId, subOrDub] = episode.id.split("/");
  
      const serverReq = await fetch(
        `${this.api}/episode/servers?episodeId=${episodeId}`,
        {
          headers: {
            Referer: this.base,
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
            Accept: "*/*",
            "X-Requested-With": "XMLHttpRequest",
          },
        },
      );
      if (!serverReq.ok) throw new Error("Failed to fetch episode servers");
  
      const serverData = await serverReq.json();
      const $ = LoadDoc(serverData.html);
  
      const servers: {
        type: string;
        name: string;
        serverId: string;
        id: string;
      }[] = [];
  
      $(".servers-sub .server-item, .servers-dub .server-item").each((_, el) => {
        servers.push({
          type: el.attr("data-type")!,
          name: el.find(".btn").text().trim(),
          serverId: el.attr("data-server-id")!,
          id: el.attr("data-id")!,
        });
      });
  
      if (!servers.length) throw new Error("No servers found");
  
      // Filter by sub/dub type
      const typed = servers.filter((s) => s.type === (subOrDub ?? "sub"));
      const pool = typed.length ? typed : servers;
  
      let selected;
      if (_server && _server !== "default") {
        selected =
          pool.find((s) => s.name.toLowerCase() === _server.toLowerCase()) ??
          pool.find((s) => s.serverId === _server);
      }
  
      selected =
        selected ??
        pool.find((s) => s.name === "Vidstreaming") ??
        pool.find((s) => s.serverId === "4") ??
        pool[0];
  
      const req = await fetch(`${this.api}/episode/sources?id=${selected.id}`, {
        headers: { Referer: this.base },
      });
      if (!req.ok) throw new Error("Failed to fetch episode sources");
  
      const data = (await req.json()) as { link: string };
      const embedUrl = data.link;
      if (!embedUrl) throw new Error("No embed link");
  
      const url = new URL(embedUrl);
      const sourceId = url.pathname.split("/").pop() || "";
      const base = embedUrl.split(sourceId)[0];
  
      const req2 = await fetch(`${base}getSources?id=${sourceId}`, {
        headers: { Referer: embedUrl },
      });
      if (!req2.ok) throw new Error("Failed to fetch stream sources");
  
      const data2 = await req2.json();
  
      const videoSources = data2.sources.map((s: any) => ({
        url: s.file,
        type: s.type === "hls" ? "m3u8" : s.type,
        quality: "auto",
        subtitles: (data2.tracks || []).map((t: any, i: number) => ({
          id: String(i),
          url: t.file,
          language: t.label,
          isDefault: t.default ?? false,
        })),
      }));
  
      return {
        server: selected.name,
        headers: { 
            "Referer": "https://rapid-cloud.co/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.7",
            "Origin": "https://rapid-cloud.co",
            "Sec-Ch-Ua": "\"Brave\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": "\"Windows\"",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Gpc": "1"
        },
        videoSources,
    };
    }
  }
  