/// <reference path='./online-streaming-provider.d.ts' />
/// <reference path='./doc.d.ts' />

class Provider {
  api: string = 'https://www.animeworld.ac';
  threshold: number = 0.7;
  getSettings(): Settings {
    return {
      episodeServers: ['AnimeWorld Server'],
      supportsDub: true,
    };
  }

  async search(query: SearchOptions): Promise<SearchResult[]> {
    let normalizedQuery = this.normalizeQuery(query['query']);
    console.log('Normalized Query: ' + normalizedQuery);

    //AniList API Call
    let aniListData:AniListAnimeDetails = await getAniListMangaDetails(query['query']);
    const aniListTitlesAndSynonyms = [...aniListData.title, ...aniListData.synonyms];

    let url = query['dub'] ? `${this.api}/filter?dub=1&sort=0&keyword=${encodeURIComponent(normalizedQuery)}` : `${this.api}/filter?dub=0&sort=0&keyword=${encodeURIComponent(normalizedQuery)}`;

    let data = await this._makeRequest(url);

    if(data.includes("Non ci sono anime con i filtri inseriti")){
      normalizedQuery = this.addSeasonWordToQuery(normalizedQuery);
      if(normalizedQuery === "") {
        throw new Error("Error encountered while adding Season word to query: " + query['query']);
      }
      url = query['dub'] ? `${this.api}/filter?dub=1&sort=0&keyword=${encodeURIComponent(normalizedQuery)}` : `${this.api}/filter?dub=0&sort=0&keyword=${encodeURIComponent(normalizedQuery)}`;
      data = await this._makeRequest(url);
    }

    if(data.includes("Non ci sono anime con i filtri inseriti")){
      throw new Error("No results found");
    }
    
    const $: DocSelectionFunction = LoadDoc(data);

    const animes: SearchResult[] = [];
    const validTitles:{title:string; score:number}[] = []; //it contains the ids and score of the valid titles

    $('div.film-list>div.item').each(
      (index: number, element: DocSelection) => {
        let aTag = element.find('.name');
        let id: string = aTag.attr('href') ?? '';
        let url: string = `${this.api}${id}`;
        let title: string = aTag.text().trim();

        let titleToCompare: string = title.toLowerCase().replace(/\s*\(\s*ita\s*\)\s*/gi, "").trim();

        console.log(titleToCompare);

        try{
          let bestScore:number | null = filterBySimilarity(titleToCompare, aniListTitlesAndSynonyms, this.threshold);
          if (bestScore != null) {
            validTitles.push({title, score: bestScore});
          }
        }
        catch(error){
          console.error("Error: " + error);
        }

        let searchResult: SearchResult = {
          id: id,
          url: url,
          title: title,
          subOrDub: 'both'
        }
        animes.push(searchResult);
      }
    );

    if(validTitles.length > 0) {
      let bestMatch = validTitles.reduce((prev, current) => (prev.score > current.score) ? prev : current);
      let animeToReturn = animes.filter(anime => anime.title.toLowerCase() === bestMatch.title.toLowerCase())[0];
      if(animeToReturn)
        return [animeToReturn];
    }
    //If no valid title is found, return an error to avoid mismatches
    throw new Error("No results found");
  }
  async findEpisodes(id: string): Promise<EpisodeDetails[]> {
    const url = `${this.api}${id}`;

    const data = await this._makeRequest(url);
    const $ = LoadDoc(data);

    let episodes = $('div.server.active>ul.episodes>li.episode').map((index, element) => {
      let aTag = element.find('a');
      let episodeId = aTag.attr('data-id') ?? "";
      let url = `${this.api}/api/episode/serverPlayerAnimeWorld?id=${episodeId}`;
      let episodeNumber = aTag.attr('data-episode-num') ?? "";

      let episodeDetails: EpisodeDetails = {
        id: episodeId,
        url: url,
        title: `Episodio ${episodeNumber}`,
        number: Number(index+1)
      }

      return episodeDetails;
    })


    return episodes;
  }
  async findEpisodeServer(
    episode: EpisodeDetails,
    _server: string
  ): Promise<EpisodeServer> {
    let server = 'AnimeWorld Server';
    if (_server !== 'default') server = _server;

    const episodeServer: EpisodeServer = {
      server: server,
      headers: {
        Referer: `${this.api}`,
        Cookie: "__ddg1_=;__ddg2_=;",
        "Access-Control-Allow-Origin": "*"
      },
      videoSources: [],
    };

    if (episode.url.startsWith('https')) {
      let [videoUrl, type] = await this.getMp4Url(episode.url);

      episodeServer.videoSources = [
        {
          quality: '720p', //I'm not able to find the quality of the video, so I set it to 720p by default
          subtitles: [],
          type: type as VideoSourceType,
          url: videoUrl
        }
      ]

      return episodeServer;
    }
    throw new Error("No server found");

  }

  async _makeRequest(url: string): Promise<string> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
        Cookie: "__ddg1_=;__ddg2_=;"
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const body = await response.text();
    return body;
  }

  normalizeQuery(query: string): string {

    const extras = [
      'EXTRA PART',
      'OVA',
      'SPECIAL',
      'RECAP',
      'FINAL SEASON',
      'BONUS',
      'SIDE STORY',
      'PART\\s*\\d+',
      'EPISODE\\s*\\d+'
    ];

    const pattern = new RegExp(`\\b(${extras.join('|')})\\b`, 'gi');

    let normalizedQuery = query
      .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1') //Removes suffixes from a number I.e. 3rd, 1st, 11th, 12th, 2nd -> 3, 1, 11, 12, 2
      .replace(/(\d+)\s*Season/i, '$1') //Removes season and keeps the number before the Season word
      .replace(/Season\s*(\d+)/i, '$1') //Removes season and keeps the number after the Season word
      .replace(pattern, '') //Removes extras
      .replace(/-.*?-/g, '') // Removes -...-
      .replace(/\bThe(?=\s+Movie\b)/gi, '')
      .replace(/~/g, ' ') //Removes ~
      .replace(/\s+/g, ' ') //Replaces 1+ whitespaces with 1
      .trim();

    return normalizedQuery;
  }


  addSeasonWordToQuery(query: string): string {
    if (/Season/i.test(query)) return query;
    
    const match = query.match(/\b(\d+)(st|nd|rd|th)?\b/);
    if (!match || match.index === undefined) return query;
    return "";
  }

  async getMp4Url(url: string): Promise<string[]> {

    const body = await this._makeRequest(url);
    const $ = LoadDoc(body);

    let videoTag = $('video>source');

    let videoUrl = videoTag.attr('src') ?? "";
    let type = videoTag.attr('type')?.split('/')[1] ?? "";

    return [videoUrl, type];

  }

  getConvertedIndex(mangaChapter: string): number {
    let chapterNumber = mangaChapter.split('.');

    if(chapterNumber.length > 1) {
      return Number(chapterNumber[0]) + 1;
    }
    return Number(chapterNumber[0]);
  }
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Inizializza la prima colonna e riga della matrice
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Calcola la distanza
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,    // Cancellazione
        matrix[i][j - 1] + 1,    // Inserimento
        matrix[i - 1][j - 1] + cost // Sostituzione
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarityScore(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1; // Evita divisione per zero
  return 1 - distance / maxLen;
}

function filterBySimilarity(input: string, candidates: string[], threshold: number): number | null{
  let validMatches = candidates
    .map(candidate => ({
      title: candidate,
      score: similarityScore(normalizeStringBeforeLevenshtein(input), normalizeStringBeforeLevenshtein(candidate)),
    }))
    .filter(item => item.score >= threshold);

  if (validMatches.length > 0) {
    return validMatches.reduce((prev, current) => (prev.score > current.score) ? prev : current).score;
  }

  return null;
    
}

async function getAniListMangaDetails(query: string, id: number = 0): Promise<AniListAnimeDetails> {
  const aniListAPI = 'https://graphql.anilist.co';
  let variables = {};
  let aniListQuery = '';

  if (id == 0) {
    variables = {
      search: query,
    };
    aniListQuery = getAniListQueryString('search');
  } else {
    variables = {
      mediaId: id,
    };
    aniListQuery = getAniListQueryString('id');
  }

  let options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: aniListQuery,
      variables: variables,
    }),
  };
  let responseGraph = await fetch(aniListAPI, options);

  if (!responseGraph.ok) {
    throw new Error(
      `Failed to fetch search results: ${responseGraph.statusText}`
    );
  }

  let data: GraphQLResponse = await responseGraph.json();
  let animeYear = data.data.Media.startDate['year'];
  let animeSynonyms = data.data.Media.synonyms;

  const titles =[];
  if (data.data.Media.title.english) {
    titles.push(data.data.Media.title.english);
  }
  if (data.data.Media.title.romaji) {
    titles.push(data.data.Media.title.romaji);
  }

  let animeDetails: AniListAnimeDetails = {
    title: titles,
    synonyms: animeSynonyms ?? [],
    year: animeYear,
  };

  return animeDetails;
}

function getAniListQueryString(type: string): string {
  let query = `query`;

  switch (type) {
    case 'id':
      query += `($mediaId: Int) {
            Media(id: $mediaId) {`;
      break;
    case 'search':
      query += `($search: String) {
            Media(search: $search) {`;
      break;
  }
  query += `id
      title {
        romaji
        english
        native
      }
      startDate {
        day
        month
        year
      }
      meanScore
      synonyms
      updatedAt
      coverImage {
        large
      }
    }
    }`;
  return query;
}

function normalizeStringBeforeLevenshtein(input:string):string{
  return input.replace(/Season/gi, '').replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1').replace(/\s+/g, ' ').trim().toLowerCase();
}

interface AniListAnimeDetails {
  title: string[];
  synonyms: string[];
  year: number;
}

interface GraphQLResponse {
  data: {
    Media: {
      id: number;
      title: {
        romaji: string;
        english: string;
        native: string;
      };
      startDate: {
        day: number;
        month: number;
        year: number;
      };
      meanScore: number;
      synonyms: string[];
      updatedAt: string;
      coverImage: {
        large: string;
      };
    };
  };
}
