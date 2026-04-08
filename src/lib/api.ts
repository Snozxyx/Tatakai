// src/lib/api.ts - Barrel file for modular services
export * from "@/types/anime";
export * from "@/lib/api/api-client";
export * from "@/services/anime.service";
export * from "@/services/home.service";
export * from "@/services/character.service";
export * from "@/services/provider.service";
export * from "@/services/jikan.service";
export * from "@/services/streaming.service";
export * from "@/services/AnalyticsService";

// Legacy exports if any components still use them under old names
// For now, we've exported everything from the services.
