# Core Content Layer

The content layer acts as the "Brain" of the Tatakai frontend. it orchestrates data flow between the UI and various backend services.

## Architecture

- **content-graph.ts**: The unified interface for browsing and searching. It handles fallback logic and normalization.
- **anime-client.ts**: Specialized client for anime-related operations.
- **manga-client.ts**: Specialized client for manga-related operations.
- **jikan-client.ts**: Direct integration with Jikan (MAL) for supplemental metadata.
- **types.ts**: Canonical TypeScript interfaces for media objects used throughout the app.

## Principles

1. **Abstraction**: The UI should never care if data comes from AniList, Jikan, or TatakaiAPI.
2. **Normalization**: All data is transformed into standard "Media" shapes before reaching the components.
3. **Resilience**: Implements retry logic and provider fallbacks.
