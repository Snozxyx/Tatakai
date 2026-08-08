# API Hooks

This directory contains React Query hooks for fetching and managing data from various APIs (AniList, Jikan, TatakaiAPI).

## Modules

- **useAnimeData.ts**: Hooks for anime details, episodes, and schedules.
- **useMangaData.ts**: Hooks for manga details, chapters, and search.
- **useAnimeSeasons.ts**: Logic for fetching series relations and seasons.
- **useSearch.ts**: Global search functionality across multiple providers.
- **useAnalytics.ts**: Integration with tracking services.

## Usage Guidelines

- Always prefer using these hooks over manual `fetch` calls to benefit from caching and state management.
- Use `staleTime` and `cacheTime` appropriately to balance fresh data with performance.
- Errors are logged globally via the `logger` utility within the query functions.
