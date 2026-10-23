# Themes Capability

Extensions can contribute custom themes **data-driven** (JSON in manifest) or **code-driven** (renderer bundle). Data-driven themes work for all installed extensions; code-driven themes require trust.

---

## Data-Driven Themes (Manifest)

Declared in `manifest.json` → `contributes.themes[]`. Registered at boot via `bootstrapExtensions.ts`.

```json
{
  "contributes": {
    "themes": [
      {
        "id": "sakura-dark",
        "name": "Sakura Dark",
        "colors": {
          "--primary": "340 82% 65%",
          "--primary-foreground": "340 5% 95%",
          "--secondary": "320 70% 55%",
          "--accent": "350 90% 70%",
          "--background": "340 15% 5%",
          "--foreground": "340 5% 95%",
          "--card": "340 12% 8%",
          "--card-foreground": "340 5% 95%",
          "--muted": "340 10% 15%",
          "--muted-foreground": "340 5% 65%",
          "--border": "340 10% 20%",
          "--ring": "340 82% 65%"
        },
        "info": {
          "label": "Sakura",
          "description": "Cherry blossom dark theme",
          "accent": "350 90% 70%",
          "gradient": "from-pink-500 via-rose-500 to-fuchsia-600",
          "icon": "🌸",
          "category": "dark"
        }
      }
    ]
  }
}
```

### Color Format

**HSL strings** (without `hsl()` wrapper): `"340 82% 65%"`

Keys map to CSS custom properties. The `--` prefix is optional (stripped at apply time):

| Key | CSS Variable | Description |
|-----|--------------|-------------|
| `primary` | `--primary` | Main brand color |
| `primaryForeground` | `--primary-foreground` | Text on primary |
| `secondary` | `--secondary` | Complementary |
| `accent` | `--accent` | High-impact highlights |
| `background` | `--background` | Page background |
| `foreground` | `--foreground` | Primary text |
| `card` | `--card` | Panel/surface background |
| `cardForeground` | `--card-foreground` | Text on card |
| `muted` | `--muted` | Inactive/secondary background |
| `mutedForeground` | `--muted-foreground` | Muted text |
| `border` | `--border` | Border color |
| `ring` | `--ring` | Focus ring |

### Registration

```ts
// bootstrapExtensions.ts
function registerContributedTheme(extensionId: string, theme: ContributedTheme) {
  const registered: RegisteredTheme = {
    id: `${extensionId}:${theme.id}`,        // Namespaced
    name: theme.name || theme.id,
    colors: theme.colors,                    // Written as CSS custom properties
    info: theme.info,
    extensionId,
  };
  extensionRegistry.registerTheme(registered);
}
```

### Theme Switcher

Themes appear in Settings → Appearance → Themes. User selection persists in `settings.theme`.

---

## Code-Driven Themes (Renderer)

For dynamic themes (time-based, reactive, animated), contribute via renderer bundle:

```ts
// renderer.js
export async function activate(ctx) {
  ctx.registry.registerTheme({
    id: `${ctx.extensionId}:dynamic-sakura`,
    name: 'Dynamic Sakura',
    colors: computeColorsBasedOnTime(), // Can be updated reactively
    info: { label: 'Sakura', category: 'dark' },
    extensionId: ctx.extensionId,
  });

  // Optional: reactive updates
  setInterval(() => {
    ctx.registry.registerTheme({
      id: `${ctx.extensionId}:dynamic-sakura`,
      name: 'Dynamic Sakura',
      colors: computeColorsBasedOnTime(),
      extensionId: ctx.extensionId,
    });
  }, 60000);
}
```

**Trust-gated:** Only loads for trusted extensions.

---

## Theme Application

When user selects a theme:

1. CSS custom properties applied to `:root` (or `[data-theme="..."]`)
2. Tailwind `dark:` variant respects `--background`/`--foreground`
3. Glassmorphism panels use `--card` + `--glass-border` + `backdrop-blur`
4. Glows use `--glow-primary` (defaults to `--primary`)

```css
/* Global application */
:root {
  --primary: 340 82% 65%;
  --background: 340 15% 5%;
  /* ... */
}

[data-theme="tatakai.extension.mycustom:sakura-dark"] {
  --primary: 340 82% 65%;
  --background: 340 15% 5%;
  /* ... */
}
```

---

## Testing Checklist

- [ ] All 12 core color tokens provided
- [ ] HSL format (space-separated, no `hsl()`)
- [ ] `info.category` set to `"dark"` or `"light"`
- [ ] Theme appears in switcher with correct label
- [ ] Switching applies instantly (no reload)
- [ ] Glass panels, glows, borders use theme colors
- [ ] Code-driven theme updates reactively
- [ ] Namespaced ID prevents collisions

---

## Related

- [Extension Overview](extensions/overview.md)
- [Manifest Reference](extensions/manifest.md)
- [Design Guidelines](../reference/design-guidelines.md)
- [Analytics Capability](extensions/capabilities/analytics.md)