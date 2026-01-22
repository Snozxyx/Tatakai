Tatakai API — FULL DOCUMENTATION

NOTE: This document concatenates all documentation files. Each file is delimited with BEGIN/END markers to help LLM consumption.

=== BEGIN FILE: intro.md ===

Introduction
Welcome to the Tatakai API documentation. This API provides a unified interface for accessing anime, manga, light novels, and comics from various sources.

🚀 Base URL
https://tatakaiapi.vercel.app/api/v1

📡 Response Format
All responses follow a standard JSON structure:

{
  "status": 200,
  "message": "Optional message",
  "data": { ... }
}

🎬 Getting Started
The quickest way to start using Tatakai API is via fetch or curl.

JavaScript Example
const res = await fetch('https://tatakaiapi.vercel.app/api/v1/hianime/home');
const data = await res.json();
console.log(data);

⚠️ Error Codes
Status	Code	Description
200	OK	Request was successful.
400	BAD_REQUEST	Missing required parameters (e.g., ?id=).
404	NOT_FOUND	Resource or endpoint does not exist.
429	TOO_MANY_REQUESTS	You have hit the rate limit.
500	INTERNAL_SERVER_ERROR	Something went wrong on our end.
🛡️ Rate Limiting
To ensure fair usage, the API enforces the following limits:

Window: 1 Minute
Limit: 60 Requests
Headers:
X-RateLimit-Limit: Total requests allowed per window.
X-RateLimit-Remaining: Requests left in the current window.
X-RateLimit-Reset: Time (in ms) until the window resets.
💻 Code Examples
JavaScript (Fetch)
async function getAnimeInfo(id) {
  const response = await fetch(`https://tatakaiapi.vercel.app/api/v1/hianime/info/${id}`);
  const data = await response.json();
  return data;
}

Python (Requests)
import requests

def get_trending():
    url = "https://tatakaiapi.vercel.app/api/v1/hianime/home"
    response = requests.get(url)
    return response.json()

PHP (cURL)
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "https://tatakaiapi.vercel.app/api/v1/hianime/home");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
$output = curl_exec($ch);
curl_close($ch);
$data = json_decode($output, true);

=== END FILE: intro.md ===

=== BEGIN FILE: hianime.md ===

HiAnime Scraper (AniWatch)
The primary, high-performance scraper for AniWatch (formerly Zoro.to), offering extensive metadata and reliable streaming.

Base URL
/api/v1/hianime

1. Homepage
Get dashboard data including Spotlight, Trending, Latest Episodes, and New Added.

URL: /home
Method: GET
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/hianime/home"

2. Information & Details
Anime Details
Get full metadata for an anime.

URL: /info/:id
Method: GET
QTip (Quick Tooltip)
Get hover-card style summary.

URL: /qtip/:id
Method: GET
Anime Episodes
Get the full list of episodes for an anime.

URL: /episodes/:id
Method: GET
3. Streaming Sources
Get video sources for a specific episode.

URL: /episode/sources
Method: GET
Query Params:
animeEpisodeId (required, e.g., one-piece-100?ep=107149)
server (optional, default: vidstreaming)
category (optional, sub or dub)
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/hianime/episode/sources?animeEpisodeId=one-piece-100?ep=107149"

4. Discovery
Search
URL: /search
Query Params: q (query), page
Optional Params: type, status, rated, score, season, language, year, genres
Search Suggestions
URL: /search/suggestion
Query Params: q
Browse By Category
URL: /category/:name (e.g. most-popular, subbed-anime)
Query Params: page
Browse By Genre
URL: /genre/:name (e.g. shounen, action)
Query Params: page
Browse By Producer
URL: /producer/:name
Query Params: page
A-Z List
URL: /azlist/:sort (e.g. all, 0-9, a)
Query Params: page
Schedule
URL: /schedule
Query Params: date (YYYY-MM-DD), tzOffset (e.g. -300 for EST)
5. Streaming Servers
URL: /episode/servers
Query Params: animeEpisodeId List available servers for an episode.
=== END FILE: hianime.md ===

=== BEGIN FILE: anikai.md ===

Anikai.to Scraper
High-performance scraper for the Anikai platform, offering ad-free streaming and clean metadata.

1. Homepage Data
Get trending and latest anime.

URL: /anikai/home
Method: GET
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anikai/home"

2. Search
Search for anime by keywords.

URL: /anikai/search
Method: GET
Query Params:
q: Search keyword
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anikai/search?q=one+piece"

3. Anime Information
URL: /anikai/info/:id
Method: GET
Params:
id (path): Anime slug
4. Streaming Sources
URL: /anikai/watch/:id
Method: GET
Query Params:
ep: Episode number (default: 1)
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anikai/watch/one-piece-37?ep=1"

=== END FILE: anikai.md ===

=== BEGIN FILE: animeya.md ===

Animeya.cc Scraper
Seamlessly scrape animeya.cc for anime data, episodes, and streaming sources. Optimized for Next.js RSC data extraction.

Base URL
/api/v1/animeya

1. Homepage Data
Retrieves featured and trending anime from the homepage.

Endpoint: /home
Method: GET
Response Schema
{
  "provider": "Animeya",
  "status": 200,
  "data": {
    "featured": [
      {
        "slug": "one-piece-21",
        "title": "ONE PIECE",
        "cover": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg",
        "type": "TV"
      }
    ],
    "trending": []
  }
}

🧪 Test Command
curl -s "https://tatakaiapi.vercel.app/api/v1/animeya/home"

2. Search
Search for anime by keyword.

Endpoint: /search
Method: GET
Query Parameters:
q (required): Search query string.
Response Schema
{
  "provider": "Animeya",
  "status": 200,
  "data": [
    {
      "slug": "one-piece-21",
      "title": "ONE PIECE",
      "cover": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg",
      "type": "TV"
    }
  ]
}

🧪 Test Command
curl -s "https://tatakaiapi.vercel.app/api/v1/animeya/search?q=one+piece"

3. Anime Information
Get detailed information and episode list for a specific anime.

Endpoint: /info/:slug
Method: GET
Parameters:
slug (required): The anime identifier (e.g., one-piece-21).
Response Schema
{
  "provider": "Animeya",
  "status": 200,
  "data": {
    "id": "one-piece-21",
    "title": "ONE PIECE",
    "cover": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg",
    "description": "Gold Roger was known as the 'Pirate King', the strongest and most infamous being to have sailed the Grand Line...",
    "episodes": [
      {
        "id": 16428,
        "number": 401,
        "title": "No Escape!? Admiral Kizaru's Light Speed Kick!!",
        "isFiller": false
      }
    ]
  }
}

🧪 Test Command
curl -s "https://tatakaiapi.vercel.app/api/v1/animeya/info/one-piece-21"

4. Streaming Sources
Get direct video sources for a specific episode.

Endpoint: /watch/:episodeId
Method: GET
Parameters:
episodeId (required): The numeric episode ID from the info endpoint (e.g., 16428).
Response Schema
{
  "provider": "Animeya",
  "status": 200,
  "data": {
    "episode": {
      "id": 16428,
      "title": "No Escape!? Admiral Kizaru's Light Speed Kick!!",
      "number": 401
    },
    "sources": [
      {
        "id": 2542,
        "code": "https://megaplay.buzz/embed/...,
        "type": "EMBED",
        "subType": "NONE",
        "langue": "ENG",
        "url": "https://megaplay.buzz/stream/..."
      }
    ]
  }
}

🧪 Test Command
curl -s "https://tatakaiapi.vercel.app/api/v1/animeya/watch/16428"

=== END FILE: animeya.md ===

=== BEGIN FILE: sdk.md ===

Official @Tatakai/api SDK
The official TypeScript SDK makes it easy to integrate Tatakai API into your projects with full type safety.

🚀 Installation
npm install @Tatakai/api

🛠️ Basic Usage
Initialize the client and start making requests.

import { TatakaClient } from "@Tatakai/api";

const client = new TatakaClient({
  baseUrl: "https://tatakaiapi.vercel.app/api/v1" // Optional, defaults to localhost:4000
});

// Fetch trending anime
const home = await client.hianime.getHome();
console.log(home.data.trendingAnimes);

// Search for anime
const results = await client.hianime.search("Naruto");

📦 SDK Modules
1. HiAnime
getHome(): Get spotlight, trending, and latest updates.
getInfo(id): Detailed metadata for a specific anime.
getEpisodes(id): Get episodes and their streaming sources.
search(query, page): Search for anime titles.
2. Utility
trace(imageUrl): Reverse image search via Trace.moe.
getRandomQuote(anime): Get inspiring quotes.
getFacts(anime): Fun facts about your favorite series.
🛡️ Configuration
Parameter	Type	Description
baseUrl	string	The root URL of your Tatakai API instance.
apiKey	string	(Optional) Your API key if authentication is.
=== END FILE: sdk.md ===

=== BEGIN FILE: regional.md ===

Regional Scrapers (Hindi, Tamil, Telugu)
Specialized scrapers for Indian regional languages and dubbed content.

1. Animelok
Next-gen scraper for animelok.to using HiAnime-style IDs.

Homepage
URL: /animelok/home
Method: GET
🧪 Example Request
curl -X GET "https://tatakaiapi.vercel.app/api/v1/animelok/home"

Watch Episode
URL: /animelok/watch/:id
Method: GET
Query Params: ep (episode number)
🧪 Example Request
# Watch specific episode (ep query param)
curl -X GET "https://tatakaiapi.vercel.app/api/v1/animelok/watch/naruto-shippuden-112233?ep=1"

2. WatchAnimeWorld (Supabase Proxy)
Proxy-enabled scraper for watchanimeworld.in to bypass geoblocking.

Get Episode Sources
URL: /watchaw/episode
Query Params:
id: Slug (e.g., naruto-shippuden-1x1) OR
episodeUrl: Full URL
🧪 Test Module
```bash curl -X GET "https://tatakaiapi.vercel.app/api/v1/watchaw/episode?id=naruto-shippuden-1x1" ```

📄 Result
```json { "status": 200, "data": { "sources": [ { "url": "https://...", "language": "Hindi", "isDub": true } ] } } ```

📦 Response Schema
```typescript interface WatchAnimeResponse { status: number; data: { sources: Array<{ url: string; // Stream URL isM3U8: boolean; // True if HLS stream quality?: string; // e.g. "auto", "1080p" language: string; // e.g. "Hindi", "Tamil" isDub: boolean; }>; } } ```

3. AnimeHindiDubbed
Classic scraper for animehindidubbed.in.

Homepage
Retrieves latest additions from the homepage.

URL: /hindidubbed/home
Method: GET
Category
Browse anime by category (e.g., hindi-anime-movies, cartoon-shows).

URL: /hindidubbed/category/:name
Method: GET
🧪 Test Module
```bash curl -X GET "https://tatakaiapi.vercel.app/api/v1/hindidubbed/category/hindi-anime-movies" ```

Search
Search for specific anime titles.

URL: /hindidubbed/search
Query Params: title
🧪 Test Module
```bash curl -X GET "https://tatakaiapi.vercel.app/api/v1/hindidubbed/search?title=doraemon" ```

Anime Info
Get details and server links for a specific anime.

URL: /hindidubbed/anime/:slug
Method: GET
🧪 Test Module
```bash curl -X GET "https://tatakaiapi.vercel.app/api/v1/hindidubbed/anime/doraemon-movie" ```

=== END FILE: regional.md ===

=== BEGIN FILE: utility.md ===

Utility & Meta APIs
Various utility endpoints ported from anime-api for quotes, facts, and image recognition.

1. Random Quotes
Get random quotes or quotes by specific anime. (Not Working)

URL: /anime-api/quotes/random
Method: GET
Query Params: anime (optional)
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anime-api/quotes/random?anime=Naruto"

2. Anime Facts
Get facts about a specific anime.

URL: /anime-api/facts/:anime
Method: GET
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anime-api/facts/naruto"

3. Image Trace (trace.moe)
Trace back an anime scene from an image URL.

URL: /anime-api/trace
Method: POST
Body: { "imageUrl": "..." }
🧪 Test Module
curl -X POST "https://tatakaiapi.vercel.app/api/v1/anime-api/trace" \
     -H "Content-Type: application/json" \
     -d '{"imageUrl": "https://images.plurk.com/32B15UXxymfSMwKGTObY5e.jpg"}'

4. Anime Images (Nekos.best)
Get various types of anime images (waifu, neko, shinobu, etc.).

URL: /anime-api/images/:type
Method: GET
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anime-api/images/neko"

5. Advanced Waifu Search (waifu.im)
Search specifically for waifu images with tag filtering.

URL: /anime-api/waifu
Method: GET
Query Params: tags (optional, e.g. maid)
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anime-api/waifu?tags=maid"

=== END FILE: utility.md ===

=== BEGIN FILE: external.md ===

Classic External Scrapers
Reliable ports of legacy anime scrapers for broad content coverage.

1. GogoAnime
Search GogoAnime (gogoanime3.co) for anime. (Not Working)

URL: /anime/gogoanime/:query
Method: GET
Response: Array of { title, link, img, released }
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anime/gogoanime/naruto"

2. Chia-Anime
Search Chia-Anime (chia-anime.su).(Not Working)

URL: /anime/chia-anime/:query
Method: GET
Response: Array of { title, link, img }
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anime/chia-anime/bleach"

3. Anime-Freak
Search Anime-Freak (animefreak.video).(Not Working)

URL: /anime/anime-freak/:query
Method: GET
Response: Array of { title, link, img }
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anime/anime-freak/one%20piece"

4. Animeland
Search Animeland (animeland.tv).

URL: /anime/animeland/:query
Method: GET
Response: Array of { title, link }
🧪 Test Module
curl -X GET "https://tatakaiapi.vercel.app/api/v1/anime/animeland/dragon%20ball"

=== END FILE: external.md ===