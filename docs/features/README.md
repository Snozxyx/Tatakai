# Features

Deep dives on Tatakai's major product systems. For the architectural context
behind these, see [../architecture/overview.md](../architecture/overview.md).

| Feature | What it covers |
| --- | --- |
| [Streaming & playback](streaming-playback.md) | Multi-provider aggregation, source health/failover, torrent + debrid streaming, the result cache. |
| [Manga](manga.md) | The comick-style reader, HTTP-primary reading via the extension-API host, sources, comments, progress. |
| [Downloads & offline](downloads-and-offline.md) | Anime + manga downloads, the offline library, continue-watching sync, auto-download. |
| [Watch2Together](watch-together.md) | Host-streamed synced rooms over a tunnel, password-protected rooms, ambient theater. |
| [Community](community.md) | The feed-first community platform: posts, polls, embeds. |
| [Recommendations](recommendations.md) | The in-house hybrid recommender + collaborative-filtering model. |
| [Ranks & badges](ranks-and-badges.md) | The unified Mitsu rank and collectible Chikra badges. |
| [Admin & moderation](admin-and-moderation.md) | Admin tooling, automod, Turnstile, news, analytics. |

Most of these are extensible or partly delivered through the **extension system**
— see [../extension/README.md](../extension/README.md).
