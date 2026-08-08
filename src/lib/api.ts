// src/lib/api.ts - Barrel file for modular services
export * from "@/types/anime";
export * from "@/types/manga";
export * from "@/lib/api/adminSecret";
export * from "@/lib/api/proxy-utils";
export * from "@/lib/api/api-client";

// Export the new core content graph
export * from "@/core";

// Analytics is independent of the provider logic
export * from "@/core/analytics/AnalyticsService";

// Export jikan service for external integrations
export * from "@/core/content/jikan-client";

// Export character service
export * from "@/core/content/character-client";
