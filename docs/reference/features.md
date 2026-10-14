# Tatakai — Complete Feature Overview

**One app. Every story. Every device.**

Tatakai is an all-in-one platform for discovering, watching, reading, tracking, and discussing anime, manga, manhwa, manhua, comics, and novels.

From advanced media playback and intelligent recommendations to cross-platform synchronization and community features, Tatakai brings everything together in one place.

---

## 1. Core Features

### Supported Content
- **Anime:** TV Series, Movies, OVAs, ONAs, and Specials.
- **Manga:** Manga, Manhwa, Manhua, and Comics.
- **Novels:** Web Novels and Light Novels.
- **Media Sources:** Direct Streams, Embedded Players, and Torrents.

### Cross-Platform Support
- **Windows** — Supported
- **macOS** — Supported (Sideloading)
- **Linux** — Supported
- **Android** — Supported
- **iOS** — Supported (Sideloading)
- **Smart TVs** — Coming Soon

---

## 2. Account Integrations

Connect your favorite tracking services and keep your library synchronized.

### Supported Integrations
- **MyAnimeList (MAL)** — Anime and manga tracking.
- **AniList** — Anime and manga tracking.
- **MangaBaka** — Manga, manhwa, manhua, and novel tracking.

**Cross-Service Synchronization**

All three integrations work together to keep your progress automatically synchronized across connected accounts.

### Discord Integration — Coming Soon

Receive personalized Discord direct messages for:

- Upcoming anime episodes and releases.
- New manga chapters and novel updates.
- Community announcements and events.
- Mentions, interactions, and notifications.

---

## 3. Anime Experience

### Anime Calendar
- Explore anime releases across different time periods.
- Track upcoming, ongoing, and previously released anime.
- Add anime release schedules to your personal calendar.
- Receive notifications when new episodes are released.

### Advanced Video Player

A highly customizable player designed for an immersive viewing experience.

**Video & Audio**
- 4K Video Upscaling
- Adaptive Quality Switching
- Multiple Audio Tracks
- Stable Volume / Volume Normalization
- Theater Mode
- Ambient Mode
- External Video Player Support

**Playback Controls**
- Auto-Skip (Openings, Endings, and Recaps)
- Auto-Play Next Episode
- Next-Episode Preview Frame
- Sleep Timer
- Custom Keyboard Shortcuts
- Screenshot Capture

**Subtitles & Accessibility**
- Community-Provided Subtitles (Extensions)
- AI-Generated Subtitles and Dubbing
- Custom Subtitle Fonts and Styling
- Subtitle Appearance Customization
- Subtitle Synchronization Controls
  - **Positive Delay:** Displays subtitles later.
  - **Negative Delay:** Displays subtitles earlier.

### Intelligent Source Panel
- Organizes available audio languages and dubbed versions into categories.
- Clearly identifies three types of media sources:
  - **Embed** — Embedded video players.
  - **HLS** — Direct streaming sources.
  - **Torrent** — Peer-to-peer media sources.
- Makes comparing and switching between sources easier.

### Character Discovery
- Explore detailed anime character information.
- Add characters to your favorites.
- Showcase your favorite characters on your public profile.

---

## 4. Manga, Manhwa & Comics

### Smart Discovery

Discover content that genuinely matches your interests instead of relying on random suggestions.

Recommendations consider:
- Reading History and Preferences
- Favorite Genres and Tags
- Similar Titles
- Personalized Recommendation Signals

### Personalized Reading Experience
- Preferred Reading Language
- Preferred Content Source
- Enriched Metadata from AniList and MangaBaka

### Advanced Reader Settings
- Multiple Reading Modes
- Infinite Vertical Scrolling
- Customizable Reader Appearance
- Additional Reading and Navigation Controls

---

## 5. Novels & Light Novels

### Smart Novel Discovery

Find novels based on your preferences, reading history, genres, themes, and personalized recommendations.

### Customizable Novel Reader
- Custom Font Families
- Adjustable Font Sizes
- Page Background Colors
- Text and Layout Styling
- Personalized Reading Preferences

### Text-to-Speech & Narration

Turn your novels into an audio experience with multiple narration engines.

**Supported TTS Providers**
- **System TTS** — Your device's built-in text-to-speech engine.
- **KittenTTS** — On-device narration model.
- **OpenAI** — AI-powered voice narration.
- **ElevenLabs** — High-quality AI narration.
- **Local Server** — OpenAI-compatible TTS endpoints.

Choose the narration service that best fits your preferences and hardware.

---

## 6. Extension Ecosystem

Tatakai is built around a flexible extension architecture, allowing users to expand available content sources without being limited to a single provider.

### Native Tatakai Extensions
- Native `.kai` Extension Format
- Streaming Providers
- Manga Providers
- Torrent Providers

### Stremio Extension Compatibility

Supports compatible Stremio HTTP/JSON addons, including:

- Streaming Addons
- Catalog Addons
- Metadata Addons
- Subtitle Addons

**Note:** Only the addon types listed above are supported. Other Stremio addon categories are currently incompatible.

### Seanime Extension Compatibility

Support for compatible Seanime extensions includes:

- JavaScript / TypeScript Streaming Providers
- JavaScript / TypeScript Manga Providers
- JavaScript / TypeScript Torrent Providers
- Compatible Custom-Source Providers
- ChromeDP-Based Manga Providers

**Compatibility Notice**

Seanime extension support is **not available yet**.

The following extension types or dependencies will not be supported initially:

- Seanime Go Extensions
- UI and System Plugins
- Providers requiring unimplemented host APIs, including:
  - `$scannerUtils`
  - `$torrentUtils`
  - `$habari`
  - `CryptoJS`

The compatibility layer is intended to run supported extensions without requiring modifications to their original code.

---

## 7. Downloads & Offline Access

Access your favorite content even without an internet connection.

### Anime Downloads
- Download Individual Episodes
- Download Entire Seasons
- Multiple Dub / Audio Options
- Torrent Downloads
- HLS Downloads
- MKV and MP4 Support

### Manga Downloads
- Download Individual Chapters
- Read Downloaded Chapters Offline

### Novel Downloads
- Download Novels for Offline Reading
- Access Downloaded Content Without an Internet Connection

**Offline Mode:** Your downloaded anime, manga, and novels remain accessible without an active internet connection.

---

## 8. Torrent, Proxy & Networking

Tatakai includes advanced networking capabilities for greater flexibility and control over media access.

### Built-in Services
- Integrated Torrent Engine
- Built-in Proxy Service
- Integrated WARP Service

### Debrid Integrations
- Real-Debrid
- TorBox
- AllDebrid
- Premiumize

Connect supported debrid services to enhance compatible media workflows.

---

## 9. Appearance & Advanced Settings

### Themes & Customization
- Up to **27 Unique Themes**
- Distinct Visual Styles and Color Schemes
- Personalized Application Appearance

### Advanced Configuration
- Advanced Watching and Reading Settings
- External Video Player Configuration
- Debugging and Diagnostic Modes

### Disk Allocation
- Configure a Maximum Storage Allocation.
- Prevent Tatakai-managed storage from exceeding the configured limit.

### Desktop Memory Optimization

Choose between multiple performance profiles based on your device's capabilities.

- **Low** — Optimized for devices with limited memory.
- **Medium** — Balanced resource usage and performance.
- **High** — Designed for more capable systems.

Includes graphical memory utilization monitoring to help users understand resource consumption.

---

## 10. Unified Search & Discovery

### Universal Search

Search across multiple content categories from a single interface:

- Anime
- Manga
- Manhwa / Manhua
- Novels
- Characters

### Anime Image Search

Identify anime using a screenshot or image.

Upload an anime screenshot and let Tatakai search for matching titles.

### Advanced Filtering

Find content using detailed filters, including:

- Genres
- Tags
- Themes
- Content Categories
- Additional Media-Specific Attributes

---

## 11. AI-Powered Recommendation Engine

**Not just another AI wrapper.**

Tatakai uses a **hybrid machine-learning recommendation engine** designed to understand individual preferences and recommend titles based on meaningful compatibility signals.

Rather than relying entirely on popularity or generic AI-generated suggestions, it analyzes multiple factors to identify content that genuinely matches your taste.

### Recommendation Factors
- **Genre Fit** — Compatibility with your preferred genres.
- **Community Signals** — Community activity and relevant engagement.
- **Studio Fit** — Preferences for particular animation studios.
- **Era Fit** — Compatibility with preferred release periods.
- **Theme Fit** — Alignment with your favorite themes.
- **Popularity** — Popularity and discovery signals.
- **Additional Factors** — Other personalized recommendation indicators.

### Interactive 3D Recommendation Graph

Explore your preferences through an interactive three-dimensional graph that visually maps relationships between titles, genres, and recommendation signals.

**The goal:** Discover content you'll actually enjoy, not just whatever happens to be trending.

---

## 12. Community & Social Features

Tatakai goes beyond watching and reading by bringing fans together through a connected community experience.

### Community Posts

Create and share different types of content:

- Text Posts
- GIFs and Images
- Playlists
- Tier Lists
- Media Discussions
- Watch-Together Sessions

### Tier Lists
- Create Personalized Tier Lists
- Rank and Organize Your Favorite Titles
- Share Your Rankings with the Community

### Playlists
- Create Custom Media Playlists
- Organize Your Favorite Titles
- Share Playlists with Other Users

### Watch Together

Watch anime with friends through synchronized playback sessions.

- **96% Two-Way Synchronization**
- Shared Playback Experience
- Collaborative Watch Sessions

### Advanced User Profiles

Showcase your identity and activity across Tatakai.

**Profile Features**
- Detailed Watching and Reading Statistics
- Customizable Profile Appearance
- Badges and Achievements
- Community Ranks
- Rewards and Recognition
- Favorite Characters and Media

### Social Connections
- Follow Other Users
- Build Your Followers and Following Lists
- Discover Community Members
- Interact Through Community Content

### Leaderboards
- Community Rankings
- User Activity and Achievements
- Competitive Community Engagement

---

## The Tatakai Experience

**Watch. Read. Discover. Track. Connect.**

Tatakai combines anime streaming, manga and novel reading, powerful extensions, smart recommendations, advanced customization, and social experiences into one unified platform.

No need to switch between multiple applications just to manage your entertainment experience.

**One app for everything. Built for everyone.**

**Tatakai — Your Entire Anime, Manga & Novel Universe in One Place.**

[GitHub](https://github.com/snozxyx/Tatakai) | [Official Website](https://tatakai.me)
