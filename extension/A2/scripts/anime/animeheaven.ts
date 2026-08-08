/// <reference path="./online-streaming-provider.d.ts" />

class Provider {
  constructor() {
    this.base = "https://animeheaven.me";
  }

  getSettings() {
    return {
      episodeServers: ["AnimeHeaven"],
      supportsDub: false,
    };
  }

  async search(query) {
    const res = await fetch(`${this.base}/search.php?s=${encodeURIComponent(query.query)}`);
    const html = await res.text();

    const regex = /<div class='similarimg'>.*?<a href='(anime\.php\?.*?)'><img.*?alt='(.*?)'/gs;
    const results = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
      const url = `${this.base}/${match[1]}`;
      const title = match[2].replace(/&#039;/g, "'");
      const id = match[1].replace("anime.php?", "");

      results.push({
        id,
        title,
        url,
        subOrDub: "sub",
      });
    }

    if (!results.length) throw new Error("No anime found");
    return results;
  }

  async findEpisodes(id) {
    const res = await fetch(`${this.base}/anime.php?${id}`);
    const html = await res.text();

    const regex = /onclick='gate\("([a-f0-9]+)"\)'.*?>\s*<div class='watch2 bc'>(\d+)<\/div>/gs;
    const episodes = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
      const gateId = match[1];
      const number = parseInt(match[2]);

      episodes.push({
        id: gateId,
        title: `Episode ${number}`,
        number,
        url: `${this.base}/gate.php`,
      });
    }

    return episodes;
  }

  async findEpisodeServer(episode, _server) {
    const res = await fetch(episode.url, {
      headers: {
        "Cookie": `key=${episode.id}`,
        "Referer": episode.url.replace("gate.php", `anime.php?`),
      },
    });
    const html = await res.text();

    const match = html.match(/<source src='(https?:\/\/.*?\.mp4\?[^\']+)'/);
    if (!match) throw new Error("Video URL not found");

    const videoUrl = match[1];

    return {
      server: "AnimeHeaven",
      headers: {
        "Cookie": `key=${episode.id}`,
        "Referer": episode.url.replace("gate.php", `anime.php?`),
      },
      videoSources: [
        {
          url: videoUrl,
          quality: "auto",
          type: "mp4",
          subtitles: [],
        },
      ],
    };
  }
}
