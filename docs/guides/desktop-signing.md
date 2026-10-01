# Desktop Code Signing & Notarization

Tatakai desktop ships **unsigned** today. Installers work, but users see an
OS trust prompt on first launch (Windows SmartScreen "Unknown publisher";
macOS Gatekeeper "cannot verify the developer"). The build is **sign-ready**:
providing the env vars below turns signing on with no config changes.

## What "unsigned" means for auto-update

- **Windows** — auto-update works unsigned. NSIS/portable installs and
  `electron-updater` diff downloads all function; users just dismiss the
  SmartScreen prompt once.
- **Linux** — no signing concept for AppImage/deb; auto-update works.
- **macOS** — `electron-updater` **requires a signed + notarized** app to apply
  updates (Squirrel.Mac verifies the code signature). Until certs exist, mac
  users update by re-downloading the latest `.dmg`. The updater surfaces a
  friendly `error` toast on mac rather than crashing (see
  `desktop/services/update-manager.cjs` → `_configureAutoUpdater`).

## Enabling signing

Signing is driven entirely by environment variables read by electron-builder —
nothing in `package.json` needs to change.

### Windows (Authenticode)

| Variable | Meaning |
|---|---|
| `CSC_LINK` | Path or base64 of the `.pfx`/`.p12` certificate |
| `CSC_KEY_PASSWORD` | Certificate password |

With these set, `electron-builder` signs the `.exe` automatically. In CI, add
them as secrets and drop the `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` line from
the **Build Electron** step in `.github/workflows/build.yml`.

### macOS (Developer ID + notarization)

| Variable | Meaning |
|---|---|
| `CSC_LINK` | Path or base64 of the Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID |
| `APPLE_TEAM_ID` | 10-char Apple Developer Team ID |

Then:

1. Remove `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` (or set it `true`) so the
   identity is discovered.
2. Set `"notarize": true` in the `build.mac` block of `package.json` (it is
   `false` today). electron-builder notarizes via the `APPLE_*` vars using the
   notary API.
3. Flip `"hardenedRuntime": false` back to `true` when signing — it is
   intentionally `false` while unsigned so the `xattr -cr` Gatekeeper
   workaround reliably works for the unsigned `.dmg`.

The hardened-runtime entitlements are in `build/entitlements.mac.plist`
(JIT, unsigned-executable-memory, library-validation-disabled for the bundled
`node-datachannel`/ffmpeg native modules, network client/server, user-selected
file access). While unsigned, `hardenedRuntime: false` and
`gatekeeperAssess: false` are set so macOS Gatekeeper treats the app as a
plain unsigned app (clear quarantine with `xattr -cr`) instead of reporting
it as "damaged".

## Local unsigned build

```bash
npm run electron:build
```

`electron:build` exports `ELECTRON_BUILD=true` (so vite emits `base:'./'`) and
`CSC_IDENTITY_AUTO_DISCOVERY=false` (so no signing is attempted). Output lands
in `dist_electron/`.
