/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./doc.d.ts" />

class Provider {

    private apiUrl = "https://www.animesaturn.cx";
    private threshold = 0.7;

    getSettings(): Settings {
        return {
            episodeServers: ["Server 1"],
            supportsDub: true,
        }
    }

    async search(query: SearchOptions): Promise<SearchResult[]> {

        let normalizedQuery = normalizeQuery(query.query)

        console.log("Normalized query:", normalizedQuery);

        let aniListData: AniListAnimeDetails = await getAniListAnimeDetails(query['query']);
        const aniListTitlesAndSynonyms = [...aniListData.title, ...aniListData.synonyms];

        let url = `${this.apiUrl}/animelist?search=${encodeURIComponent(normalizedQuery)}`;

        let html = await _makeRequest(url);

        if (html.includes("Non sono stati trovati risultati")) {
            normalizedQuery = addSeasonWordToQuery(normalizedQuery);

            if (normalizedQuery === "") {
                throw new Error("Error encountered while adding Season word to query: " + query.query);
            }
            url = `${this.apiUrl}/animelist?search=${encodeURIComponent(normalizedQuery)}`;
            html = await _makeRequest(url);
        }

        if (html.includes("Non sono stati trovati risultati")) {
            throw new Error("No results found for the query: " + query.query);
        }

        const results: SearchResult[] = [];
        const validTitles: { title: string; score: number }[] = [];
        const totalPages: number | null = getPageNumbers(html);

        if (totalPages == null) {
            throw new Error("No anime found");
        }

        for (let i = 1; i <= totalPages; i++) {
            if (i > 1) {

                url = `${this.apiUrl}/animelist?page=${i}&search=${normalizedQuery}`;
                try {
                    html = await _makeRequest(url);
                }
                catch (error) {
                    console.error(error);
                }
            }

            let $ = LoadDoc(html);

            $(".item-archivio").each((_, element) => {
                const url = element.find("a").attr("href") || "";
                const title = element.find(".badge").text().trim();
                const id = url.split(this.apiUrl)[1]
                const subOrDub: SubOrDub = GetSubOrDub(url);

                let titleToCompareDub: string = "";

                if (query.dub) {
                    titleToCompareDub = title.replace(/\s*\(\s*ita\s*\)\s*/gi, "").trim();
                }

                try {
                    let titleToSubmit: string = query.dub ? titleToCompareDub : title
                    let bestScore: number | null = filterBySimilarity(titleToSubmit, aniListTitlesAndSynonyms, this.threshold);
                    console.log(title, bestScore);
                    if (bestScore != null) {
                        validTitles.push({ title: title, score: bestScore });
                    }
                    console.log(validTitles);
                }
                catch (error) {
                    console.error("Error: " + error);
                }

                if (query.dub) {
                    if (subOrDub === "dub") {
                        results.push({
                            id: id,
                            title: title,
                            url: url,
                            subOrDub: subOrDub,
                        });
                    }
                }
                else {
                    if (subOrDub === "sub") {
                        results.push({
                            id: id,
                            title: title,
                            url: url,
                            subOrDub: subOrDub,
                        });
                    }
                }
            });
        }

        console.log("outside for");
        console.log(validTitles);

        if (validTitles.length > 0) {
            let bestMatch = validTitles.reduce((prev, current) => (prev.score > current.score) ? prev : current);
            let animeToReturn = results.filter(anime => anime.subOrDub == (query['dub'] ? "dub" : "sub")).filter(anime => anime.title.toLowerCase() === bestMatch.title.toLowerCase())[0];

            if (animeToReturn)
                return [animeToReturn];
        }

        throw new Error("No results found");
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {

        const url = new URL(`${this.apiUrl}/${id}`);

        const html = await _makeRequest(url.toString());

        console.log(html)
        const $ = LoadDoc(html);

        const episodes: EpisodeDetails[] = [];

        $(".episodes-button").each((_, element) => {
            const url = element.find("a.bottone-ep").attr("href") || "";
            const title = element.find("a.bottone-ep").text().trim();
            const number: number = parseInt(url.split("-ep-")[1]);
            const id = url.split(this.apiUrl)[1]

            episodes.push({
                id: id,
                number: number,
                url: url,
                title: title,
            });
        });

        return episodes;
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        let server = "Server 1"
        if (_server !== "default") server = _server

        const html = await _makeRequest(episode.url);
        const $ = LoadDoc(html);
        const episodeServerUrl = $('a[href*="watch"]').attr("href") + "&s=alt" || "";
        const episodeServerHtml = await _makeRequest(episodeServerUrl);

        const videoSources: VideoSource[] = [];
        let eu: string = "";
        let headers: any = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
        };

        const hlsUrlRegex = /<source[^>]+src="(https:\/\/[^"]+\.m3u8)"/;
        const hlsMatch = episodeServerHtml.match(hlsUrlRegex);

        if (hlsMatch) {

            eu = hlsMatch[1].trim();
            console.log("HLS URL found:", eu);

            const hlsText = await _makeRequest(eu);
            const regex = /#EXT-X-STREAM-INF:BANDWIDTH=\d+,RESOLUTION=(\d+x\d+)\s*(.*)/g;


            let resolutionMatch;
            while ((resolutionMatch = regex.exec(hlsText)) !== null) {
                let url = "";
                if (resolutionMatch[2].includes("list")) {
                    url = `${eu.split('/playlist.m3u8')[0]}/${resolutionMatch[2].split('./')[1]}`;
                }
                else {
                    url = `${hlsText.split('/list')[0]}/${resolutionMatch[2]}`
                }
                videoSources.push({
                    quality: resolutionMatch[1].split('x')[1] + 'p', // 1920x1080 -> 1080p
                    subtitles: [], //Subs are already integrated in the video source
                    type: 'm3u8', //Standard type for AnimeKai
                    url: url
                });
            }
            let hostUrl = eu.split('https://')[1].split('/DDL')[0];
            headers["Host"] = hostUrl;
            headers["Referer"] = hostUrl;

        }
        else {
            const mp4UrlRegex = /file:\s*"(https:\/\/[^"]+\.mp4)"/;
            const mp4Match = episodeServerHtml.match(mp4UrlRegex);

            console.log("MP4 URL found:", mp4Match);
            eu = mp4Match ? mp4Match[1].trim() : "";


            headers["Host"] = eu.split('https://')[1].split('/DDL')[0];
            headers["Referer"] = eu.split('https://')[1].split('/DDL')[0];

            videoSources.push({
                quality: "720p",
                subtitles: [], //Subs are already integrated in the video source
                type: 'mp4', //Standard type for AnimeKai
                url: eu
            });
        }

        const episodeServer: EpisodeServer = {
            server: server,
            headers: headers,
            videoSources

        }
        return episodeServer;
    }
}

/**
 * Determines whether the anime is dubbed or subtitled based on the provided URL.
 * Assumes 'dub' if 'ita' is present and 'sub' is not explicitly mentioned.
 * 
 * @param animeUrl 
 * @returns 
 */

function GetSubOrDub(animeUrl: string): SubOrDub {

    const url = animeUrl.toLowerCase();
    if (url.includes("ita") && !url.includes("sub")) {
        return "dub";
    }

    return "sub";

}

function normalizeQuery(query: string): string {

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

    let normalizedQuery: string = query
        .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1') //Removes suffixes from a number I.e. 3rd, 1st, 11th, 12th, 2nd -> 3, 1, 11, 12, 2
        .replace(/(\d+)\s*Season/i, '$1') //Removes season and keeps the number before the Season word
        .replace(/Season\s*(\d+)/i, '$1') //Removes season and keeps the number after the Season word
        .replace(pattern, '') //Removes extras
        .replace(/-.*?-/g, '') // Removes -...-
        .replace(/\bThe(?=\s+Movie\b)/gi, '')
        .replace(/~/g, ' ') //Removes ~
        .replace(/\s+/g, ' ') //Replaces 1+ whitespaces with 1
        .trim();

    const match = normalizedQuery.match(/[^a-zA-Z0-9 ]/);

    if (match) {
        const index = match.index!;
        return normalizedQuery.slice(0, index).trim();
    }

    return normalizedQuery;
}

/**
 * Extracts the total number of pages from the provided HTML string.
 * Useful for paginated results (e.g., a search query that returns many results).
 * 
 * @param html 
 * @returns 
 */

function getPageNumbers(html: string): number | null {
    if (html == null || html == "") {
        return null;
    }
    const match = html.match(/totalPages\s*:\s*(\d+)/i);

    if (match && match[1]) {
        const totalPages = parseInt(match[1], 10);
        return totalPages
    }

    return 1;
}


function addSeasonWordToQuery(query: string): string {
    if (/Season/i.test(query)) return query;

    const match = query.match(/\b(\d+)(st|nd|rd|th)?\b/);
    if (!match || match.index === undefined) return query;
    return "";
}

/**
 * Returns the HTML body of an HTTP response
 * 
 * @param url -> The URL to fetch
 * @returns  A string with the response body, or a fallback message if any error occurs
 */

async function _makeRequest(url: string): Promise<string> {
    try {
        let response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                Referer: 'https://www.animesaturn.cx/',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
                Cookie: "__ddg1_=;__ddg2_=;"
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        let body = await response.text();

        const match = body.match(/document\.cookie="([^"]+)"/);
        if (match) {
            const cookie = match[1].split(";")[0];

            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
                    Referer: 'https://www.animesaturn.cx/',
                    Cookie: cookie
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.statusText}`);
            }
            body = await response.text();
        }

        return body;
    }
    catch (error) {
        console.error(error);
        return "Non sono stati trovati risultati";
    }

}

/**
 * 
 * Returns the number of single-character edits required to change one word into another
 * 
 * @param a -> String to compare
 * @param b -> String to be compared with
 * @returns 
 */

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

/**
 * 
 * Returns the score based on the levenshtein distance algorithm
 * 
 * @param a -> String to compare
 * @param b -> String to be compared with
 * @returns 
 */

function similarityScore(a: string, b: string): number {
    const distance = levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);

    console.log("DISTANCE: " + distance);
    console.log("MAXLEN: " + maxLen);
    console.log(1 - distance / maxLen);

    if (maxLen === 0) return 1; // Evita divisione per zero
    return 1 - distance / maxLen;
}

/**
 * 
 * Returns the highest score based on the levenshtein distance algorithm
 * 
 * @param input -> String to compare
 * @param candidates -> String[] to compare the input with
 * @param threshold
 * @returns 
 */

function filterBySimilarity(input: string, candidates: string[], threshold: number): number | null {

    if (!input || input.trim() === "") {
        console.error("Invalid input string.");
        return null;
    }

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

/**
 * Makes an HTTP request to the AniList API based on the specified parameter
 * 
 * @param query 
 * @param id 
 * @returns 
 */

async function getAniListAnimeDetails(query: string, id: number = 0): Promise<AniListAnimeDetails> {
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

    const titles = [];
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

/**
 * Returns a string containing the query for AniList API
 * 
 * @param type -> String representing the parameter to use for the fetch
 * @returns 
 */

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

/**
 * Replaces Season with empty string. 
 * Keeps the number and not the suffix -> [2nd] = [2]
 * Replaces any number of sequential whitespace with just one
 * Converts the string to lower case
 *  
 * @param input 
 * @returns 
 */

function normalizeStringBeforeLevenshtein(input: string): string {
    const normalized = input.replace(/Season/gi, '').replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1').replace(/\s+/g, ' ').trim().toLowerCase();
    return normalized;
}

/**
 * Waits for ms milliseconds
 * 
 * @param ms 
 * @returns 
 */
function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}



/**
 * 
 * INTERFACES
 * 
 */

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
