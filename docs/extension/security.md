# Extension execution and validation

Packages install without cryptographic signatures. Native identifier validation, package structure checks, archive limits, declared network access, authenticated publishing, database rate limits, admin moderation, and kill switches remain enforced.

Desktop providers use the existing worker host; renderer contributions and mobile providers execute in the application realm. These hosts are not a security boundary against arbitrary installed code. Seanime helpers bind inside the provider wrapper rather than replacing application globals. Stremio calls HTTP/JSON resources without executing addon code.

Configured manifest URLs and provider preferences remain local. Catalog synchronization fetches metadata only and never executes payloads. Imported compatibility is an API classification rather than a claim of verified playback. Unsupported host APIs return explicit errors.

The backend importer rejects private/reserved fetch destinations and rechecks each redirect, bounds responses and concurrency, and preserves moderation across synchronization. Publishing remains authenticated and admin controls remain server-side.
