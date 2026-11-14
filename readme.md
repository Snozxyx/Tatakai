<div align="center">
  <img src="public/assets/logo/readme-banner.webp" alt="Crimson sun over a misty sakura valley" width="100%" />
  <h1>Tatakai</h1>
  <p><strong>Anime, manga, and novels. Your sources, your way.</strong></p>
  <p>
    <a href="https://tatakai.app">Open Tatakai</a> ·
    <a href="https://github.com/Snozxyx/Tatakai/releases/latest">Download</a> ·
    <a href="docs/README.md">Documentation</a> ·
    <a href="https://dsc.gg/tatakai">Discord</a>
  </p>
</div>

Tatakai brings discovery, watching, reading, and community into one customizable app. Install extensions to choose your sources and build a library that follows you across devices.

## Features

- Discover anime, manga, and novels with search, recommendations, and seasonal catalogs.
- Watch and read through your installed extensions.
- Track your library, progress, favorites, and continue-watching list.
- Join community discussions and watch rooms.
- Customize themes, layouts, profiles, and playback.
- Download supported content for offline use on native apps.

## Platforms

| Platform | Supported devices |
| --- | --- |
| Web | Modern browsers |
| Desktop | Windows, macOS, Linux |
| Android | Phones, tablets, Android TV |
| iOS | iPhone, iPad |

Use the [web app](https://tatakai.app) or get a native build from [Releases](https://github.com/Snozxyx/Tatakai/releases/latest).

## Development

Use Node.js 22 or later. Follow the [development setup](docs/development.md) to clone the app and private API, get contributor access, and configure development keys.

```sh
npm ci
npm --prefix tatakaiapi ci
npm run dev
```

The frontend and API run on your computer. Contributors use a separate development Supabase instance. See [Contributing](docs/contributing.md) for the pull request process.

## Extensions

Build your own extension with the [extension guide](docs/extensions/overview.md), or host your sources with the independently maintained [Tatakai Extension Server](https://github.com/Snozxyx/TatakaiServer).

Connect a server in **Settings → Extension Hub → Extension Servers**. App checkouts include the server as a Git submodule; initialize it with:

```sh
git submodule update --init --recursive
```

## Support

[Report an issue or suggest a feature](https://github.com/Snozxyx/Tatakai/issues), or join the [Discord community](https://dsc.gg/tatakai).

## License

[Mozilla Public License 2.0](LICENSE).
