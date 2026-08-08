# Services Layer

Low-level infrastructure and business logic services.

## Key Services

- **auth.ts**: Authentication logic and integration with Supabase.
- **storage.ts**: Wrapper for local storage and caching strategies.
- **analytics.ts**: Event tracking and telemetry.
- **notifications.ts**: Push notification and in-app alert management.

## Integration

Services are typically consumed by hooks or directly by the core layer. They should remain framework-agnostic where possible.
