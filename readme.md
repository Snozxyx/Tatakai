<div align="center">
  <img
    src="public/assets/logo/tatakaibanner.png"
    alt="Tatakai banner"
    width="100%"
  />

  <h1>Tatakai</h1>

  <p><strong>Discover, watch, and read—your way.</strong></p>

  <p>
    A customizable, community-driven anime and manga platform.
    Tatakai's extension-first design lets you choose your sources.
  </p>

  <p>
    <a href="https://dsc.gg/tatakai">💬 Join the Discord</a>
    ·
    <a href="https://github.com/snozxyx/tatakai/issues">🐛 Report an issue</a>
    ·
    <a href="https://github.com/snozxyx/tatakai">⭐ View on GitHub</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react&logoColor=black" alt="React 18.2.0" />
    <img src="https://img.shields.io/badge/TypeScript-5.0.0-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.0.0" />
    <img src="https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white" alt="Vite 5.x" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-3.x-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 3.x" />
    <img src="https://img.shields.io/badge/Supabase-2.x-3FCF8E?logo=supabase&logoColor=white" alt="Supabase 2.x" />
  </p>

  <p>
    <a href="https://github.com/snozxyx/tatakai/stargazers">
      <img src="https://img.shields.io/github/stars/snozxyx/tatakai?style=flat&logo=github" alt="GitHub stars" />
    </a>
    <a href="https://github.com/snozxyx/tatakai/issues">
      <img src="https://img.shields.io/github/issues/snozxyx/tatakai?style=flat&logo=github" alt="GitHub issues" />
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/github/license/snozxyx/tatakai?style=flat" alt="License" />
    </a>
  </p>
</div>

---

## Contents

- [Extension Server](https://github.com/Snozxyx/TatakaiServer#readme)
- [Overview](#overview)
- [Platforms](#platforms)
- [Roadmap](#roadmap)
- [API](#api)
- [Community and support](#community-and-support)
- [Legal and licensing](#legal-and-licensing)
- [Security](#security)
- [AI disclosure](#ai-disclosure)
- [Star history](#star-history)

## Overview

Tatakai brings anime discovery, streaming, manga reading, and community features together in one customizable app. Instead of relying on a single built-in provider, its extension-first design lets users choose their sources.

Host your own sources with **[Tatakai Extension Server](https://github.com/Snozxyx/TatakaiServer)**:
setup, built-in proxy, live logs, and deployment buttons for Vercel, Cloudflare,
Heroku and Render. Set its API in **Settings → Extension Hub → Extension Servers**,
or [configure a connection](https://tatakai.me/connect-server).

The service is maintained independently in
[`Snozxyx/TatakaiServer`](https://github.com/Snozxyx/TatakaiServer) and included here
as the `tatakai-server/` Git submodule. Initialize it in an existing checkout:

```sh
git submodule update --init --recursive
```

For a new Tatakai checkout, use `git clone --recurse-submodules`.

## Platforms

| Platform | Status |
| --- | --- |
| Web | Available |
| Desktop | Available |
| Android | Available |
| Android | Available |
| iOS | Available |

## Roadmap

- Expand compatibility with extensions from other applications.


## Community and support

- **Primary maintainer:** Snozxyx
- **Secondary maintainer:** GabhastiGiri
- **Discord:** [Join the community](https://dsc.gg/tatakai)
- **Issues and feature requests:** [Open a GitHub issue](https://github.com/snozxyx/tatakai/issues)
- **Contact:** [snozxyx@gmail.com](mailto:snozxyx@gmail.com)

Discord is currently Tatakai's only official social channel. Please report accounts on other social platforms that claim to represent Tatakai.

For security concerns, use [GitHub private vulnerability reporting](https://github.com/Snozxyx/Tatakai/security) rather than sharing sensitive details in a public issue — see [SECURITY.md](SECURITY.md) for scope, response times and safe-harbour terms. The published self-assessment (what was reviewed, what is fixed, and what is still open) is in [docs/security/SECURITY_AUDIT.md](docs/security/SECURITY_AUDIT.md).

## Legal and licensing

> [!IMPORTANT]
> Tatakai does not host media files on its servers. Users are responsible for accessing media legally and complying with the laws that apply to them. Extensions available through the app are unaffiliated with Tatakai and may be removed if they are found to violate copyright laws.

Content accessed through third-party extensions, scraping integrations, or public APIs remains subject to the rights and terms of its respective owners. Tatakai does not claim ownership of third-party content or services.

Tatakai is developed as a non-commercial, educational frontend project and is licensed under the [Mozilla Public License 2.0](LICENSE). Please read the license before modifying or redistributing the project.

**Licensing note:** The MPL-2.0 does not itself prohibit commercial use or require an entire combined project to be open source. Any additional restrictions would need separate, legally reviewed terms; they are not imposed by the MPL-2.0 alone.

For legal or content-related concerns, contact [snozxyx@gmail.com](mailto:snozxyx@gmail.com).

## Security

Security reports go through [GitHub private vulnerability reporting](https://github.com/Snozxyx/Tatakai/security) — please do not open a public issue with details. [SECURITY.md](SECURITY.md) covers scope, what to include, response targets and safe harbour.

The repository also carries its own executable security baseline, so the trust-boundary decisions below cannot silently regress:

```bash
node scripts/check-security-baseline.mjs   # 20 repository invariants
node scripts/check-audit-gate.mjs          # production dependency advisories
node scripts/check-migrations.mjs          # schema lint, incl. RLS coverage
```

What was reviewed, what was fixed, and — importantly — [what is still open](docs/security/SECURITY_AUDIT.md#e-open-findings-and-residual-risk) is documented in [`docs/security/SECURITY_AUDIT.md`](docs/security/SECURITY_AUDIT.md).

## AI disclosure

This project uses AI. Read the [AI disclaimer](docs/reference/ai-disclaimer.md).

## Star history

[![Star History Chart](https://api.star-history.com/chart?repos=snozxyx/tatakai&type=date&legend=top-right)](https://www.star-history.com/?repos=snozxyx%2Ftatakai&type=date&legend=top-right)

<p align="center">
  <em>Created for anime fans, by an anime fan.</em>
</p>
