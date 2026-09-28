# Custom Themes

An extension can contribute one or more themes. Themes are **data-driven** — no
renderer code required — declared in `contributes.themes`. They appear in the
theme switcher automatically and apply through the same mechanism as built-in
themes (each color written as a CSS variable).

## Declaring themes

```jsonc
"capabilities": ["theme"],
"contributes": {
  "themes": [
    {
      "id": "aurora-borealis",
      "name": "Aurora Borealis",
      "colors": {
        "primary": "160 84% 55%",
        "primaryForeground": "160 40% 6%",
        "secondary": "190 70% 45%",
        "accent": "270 70% 60%",
        "background": "200 40% 5%",
        "foreground": "160 20% 96%",
        "card": "200 30% 8%",
        "cardForeground": "160 20% 96%",
        "muted": "200 20% 14%",
        "mutedForeground": "180 15% 66%",
        "border": "190 25% 20%",
        "glass": "200 30% 9%",
        "glowPrimary": "160 84% 55%",
        "glowSecondary": "270 70% 60%",
        "surface": "200 35% 6%",
        "surfaceHover": "200 30% 11%",
        "sidebarBackground": "200 45% 4%",
        "sidebarBorder": "190 25% 16%"
      },
      "info": {
        "label": "Aurora Borealis",
        "description": "Cool teal-and-violet night sky.",
        "accent": "160 84% 55%",
        "category": "dark"
      }
    }
  ]
}
```

## Color values are HSL triples

Every value in `colors` is an **`"H S% L%"`** string (no `hsl()` wrapper), e.g.
`"239 84% 67%"`. This matches how the app defines its CSS custom properties, so
`applyTheme` can write each token directly as a CSS variable. Provide the full
token set shown above for a complete look; missing tokens fall back.

`info` (optional) drives the switcher card: `label`, `description`, `accent`
(an HSL triple for the swatch), optional `gradient`/`icon`, and
`category: 'dark' | 'light'`.

## How it wires up

- `bootstrapExtensions` reads `contributes.themes` and calls
  `extensionRegistry.registerTheme(...)`. The theme id is namespaced under the
  extension id so `unregisterAll(extensionId)` cleans it up.
- `src/hooks/ui/useTheme.ts` keeps a module-level `registeredThemes` map fed
  from the registry. `type ThemeId = Theme | string` widens the state/persisted
  value to accept extension ids. `resolveColors(id)` returns
  `THEME_COLORS[id] ?? registeredThemes.get(id)?.colors ?? THEME_COLORS['cherry-blossom']`
  and is the single source used by `applyTheme`, the loader guard, and account
  sync.
- `ThemeSelector` and `themeInfo` iterate registered themes, so a contributed
  theme shows up in the switcher with no extra UI work.

## Code-driven alternative

A renderer bundle may also call `ctx.registry.registerTheme(...)` at
`activate()` time — useful if the theme is computed. Data-driven
(`contributes.themes`) is preferred for static themes.
