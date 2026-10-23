# UI Slots & Pages Capability

Code-driven contributions (trust-gated) allow extensions to inject React components into the app's UI: **pages** (full routes) and **slots** (embedded components in predefined locations).

---

## Capability Declaration

```json
{
  "capabilities": ["ui"],
  "contributes": {
    "rendererEntry": "renderer.js"
  }
}
```

**Requires trust** — only loads for trusted extensions.

---

## ExtensionContext Registry API

```ts
interface ExtensionContext {
  registry: ExtensionRegistry;
  // ... other fields
}

// ExtensionRegistry methods (called via ctx.registry)
registerPage(page: ExtensionPage): void;
registerSlot(slot: ExtensionSlot): void;
```

### ExtensionPage

```ts
interface ExtensionPage {
  id: string;                    // Namespaced: `${extensionId}:my-page`
  path: string;                  // Route path (e.g. "/my-page", "/settings/my-feature")
  component: React.ComponentType; // Page component
  label: string;                 // Sidebar/menu label
  icon?: string;                 // Lucide icon name or component
}
```

### ExtensionSlot

```ts
interface ExtensionSlot {
  id: string;                    // Namespaced: `${extensionId}:my-slot`
  slotId: string;                // Predefined slot ID (see below)
  component: React.ComponentType<any>; // Slot component
}
```

---

## Predefined Slot IDs

| Slot ID | Location | Description |
|---------|----------|-------------|
| `header:actions` | Header toolbar (right) | Buttons, menus, search |
| `header:user-menu` | User dropdown | Profile, settings, logout |
| `sidebar:top` | Sidebar top section | Above navigation |
| `sidebar:bottom` | Sidebar bottom section | Below navigation |
| `sidebar:extensions` | Extensions sidebar section | Extension-specific nav |
| `settings:panels` | Settings page | Additional settings panels |
| `player:controls` | Video player controls | Custom buttons, overlays |
| `reader:toolbar` | Manga/novel reader toolbar | Custom reading controls |
| `anime:detail:actions` | Anime detail page | Buttons below poster |
| `manga:detail:actions` | Manga detail page | Buttons below cover |
| `novel:detail:actions` | Novel detail page | Buttons below cover |
| `profile:tabs` | User profile | Additional profile tabs |
| `community:post:actions` | Community post | Post interaction buttons |
| `search:filters` | Search page | Additional filter chips |
| `home:sections` | Home page | Custom content sections |
| `watch-together:controls` | Watch Together session | Session-specific controls |

---

## Page Registration

```ts
// renderer.js
import { MyPage } from './pages/MyPage';
import { MySettingsPanel } from './pages/MySettingsPanel';

export async function activate(ctx) {
  // Full page route
  ctx.registry.registerPage({
    id: `${ctx.extensionId}:my-page`,
    path: '/my-feature',
    component: MyPage,
    label: 'My Feature',
    icon: 'sparkles',
  });

  // Settings panel (lazy-loaded via route /settings/my-feature)
  ctx.registry.registerPage({
    id: `${ctx.extensionId}:settings`,
    path: '/settings/my-feature',
    component: MySettingsPanel,
    label: 'My Feature',
    icon: 'settings',
  });
}
```

**Routing:** Pages mount at `path` under the app's router. Settings panels appear in Settings → Extensions.

---

## Slot Registration

```ts
// renderer.js
import { HeaderActionButton } from './slots/HeaderActionButton';
import { PlayerQualityBadge } from './slots/PlayerQualityBadge';
import { SidebarExtensionLink } from './slots/SidebarExtensionLink';

export async function activate(ctx) {
  // Header action button
  ctx.registry.registerSlot({
    id: `${ctx.extensionId}:header-action`,
    slotId: 'header:actions',
    component: HeaderActionButton,
  });

  // Player control
  ctx.registry.registerSlot({
    id: `${ctx.extensionId}:player-badge`,
    slotId: 'player:controls',
    component: PlayerQualityBadge,
  });

  // Sidebar link
  ctx.registry.registerSlot({
    id: `${ctx.extensionId}:sidebar-link`,
    slotId: 'sidebar:extensions',
    component: SidebarExtensionLink,
  });
}
```

---

## Rendering Slots

**Component:** `src/core/extensions/ExtensionSlot.tsx`

```tsx
// In any component
import { ExtensionSlot } from '@/core/extensions/ExtensionSlot';

function Header() {
  return (
    <header>
      <ExtensionSlot slotId="header:actions" />
    </header>
  );
}

function VideoPlayer() {
  return (
    <div className="player-controls">
      <ExtensionSlot slotId="player:controls" />
    </div>
  );
}
```

**Behavior:**
- Multiple components per slot → rendered in registration order
- Empty slot → renders nothing (no wrapper)
- Components receive no props by default (use context/hooks for data)

---

## Slot Component Patterns

### Header Action Button

```tsx
// slots/HeaderActionButton.tsx
import { useExtensionStore } from '@/features/extensions/hooks/useExtensionStore';

export function HeaderActionButton() {
  const { enabledExtensions } = useExtensionStore();
  const myExt = enabledExtensions.find(e => e.id === 'my-extension');
  
  if (!myExt) return null;
  
  return (
    <Button variant="ghost" size="icon" onClick={() => navigate('/my-feature')}>
      <Sparkles className="h-4 w-4" />
    </Button>
  );
}
```

### Player Control

```tsx
// slots/PlayerQualityBadge.tsx
import { usePlayerStore } from '@/features/player/hooks/usePlayerStore';

export function PlayerQualityBadge() {
  const { quality, sources } = usePlayerStore();
  const mySource = sources.find(s => s.source.includes('MyExt'));
  
  if (!mySource) return null;
  
  return (
    <Badge variant="outline" className="ml-2">
      {mySource.quality} · {mySource.source}
    </Badge>
  );
}
```

### Settings Panel

```tsx
// pages/MySettingsPanel.tsx
import { ExtensionSettingsBase } from '@/features/extensions/components/ExtensionSettingsBase';

export function MySettingsPanel() {
  return (
    <ExtensionSettingsBase extensionId="my-extension">
      <SettingsSection title="My Feature Settings">
        <SettingToggle
          label="Enable Feature"
          key="myFeatureEnabled"
          default={true}
        />
        <SettingSelect
          label="Default Quality"
          key="defaultQuality"
          options={['1080p', '720p', '480p']}
          default="1080p"
        />
      </SettingsSection>
    </ExtensionSettingsBase>
  );
}
```

---

## Using App's React Instance

**Critical:** Renderer bundle **MUST** use the app's React instance (passed via `ctx.React`), never bundle its own. A second React instance breaks hooks and context.

```ts
// renderer.js - CORRECT
export async function activate(ctx) {
  const { React } = ctx;  // Use app's React
  const MyComponent = React.memo(() => <div>Hello</div>);
  ctx.registry.registerPage({ ..., component: MyComponent });
}

// WRONG - bundles own React
import React from 'react';  // ❌ Breaks hooks/context
```

The loader publishes `window.React = React` as a belt-and-suspenders fallback.

---

## Navigation & Context

```ts
// ExtensionContext.navigate
ctx.navigate('/my-feature');  // Programmatic navigation

// ExtensionContext.storage (namespaced localStorage)
ctx.storage.set('key', 'value');
const val = ctx.storage.get('key');

// ExtensionContext.log (namespaced console)
ctx.log('MyExtension', 'Page mounted');
```

---

## Unloading

```ts
// renderer.js
export async function activate(ctx) {
  // ... register pages/slots
  
  return () => {
    // Cleanup: unregister, cancel timers, close connections
    ctx.registry.unregisterAll(ctx.extensionId); // Auto-called by loader
  };
}
```

The loader calls `dispose()` on unload and runs `extensionRegistry.unregisterAll(extensionId)`.

---

## Testing Checklist

- [ ] Uses `ctx.React` (not bundled React)
- [ ] Page registers with valid `path`, `component`, `label`
- [ ] Slot registers with valid predefined `slotId`
- [ ] Slot component renders without props
- [ ] Multiple slots per `slotId` render in order
- [ ] Settings panel uses `ExtensionSettingsBase`
- [ ] Namespaced `storage` works
- [ ] `navigate` works for programmatic routing
- [ ] `dispose` cleans up timers/subscriptions
- [ ] Works in web, desktop, and mobile builds

---

## Related

- [Extension Overview](extensions/overview.md)
- [Manifest Reference](extensions/manifest.md)
- [Services/Modules](extensions/capabilities/services.md)
- [Renderer Loader](extensions/renderer-loader.md)