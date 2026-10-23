# Mihon Android source API

`vendor/eu/kanade/tachiyomi` is taken from
https://github.com/kodjodevf/m_extension_server/tree/664fd81aeed63d7d234d95baa907bd285ffa59bc/android/src/main/kotlin/eu/kanade/tachiyomi
and retains that directory's Apache-2.0 LICENSE. It contains the Mihon/Aniyomi source API and network helpers; the upstream Flutter plugin, HTTP server and invocation wrapper are not included.

Tatakai changes: network response-body logging and global compression interceptors are removed; the application module registers a protobuf decoder for modern original extensions. Repository/package persistence, signature validation, source dispatch and adapters are implemented separately in Tatakai's module. No external solver is configured.

Source APKs are loaded unchanged by Android's class loader. This module is shared by mobile and TV and runs in Tatakai's non-exported compatibility process.
