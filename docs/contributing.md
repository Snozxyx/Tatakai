# Contributing to Tatakai

Thank you for contributing! This guide covers code standards, PR process, and how to get started.

---

## Quick Start

```bash
# 1. Fork & clone
git clone https://github.com/snozxyx/Tatakai.git
cd Tatakai

# 2. Install deps
pnpm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your Supabase credentials (or use local)

# 4. Start dev
pnpm dev          # Web only
pnpm dev:desktop  # Electron
```

---

## Code Standards

### TypeScript

- **Strict mode** — No `any`, use `unknown` + type guards
- **Explicit returns** — Public functions must have return types
- **No enums** — Use `const` objects or union types
- **Interfaces over types** — For object shapes
- **Generics** — Prefer over overloads

```ts
// ✅ Good
interface MediaItem {
  id: string;
  title: string;
  type: 'anime' | 'manga' | 'novel';
}

function getMedia<T extends MediaItem>(type: T['type']): Promise<T[]>;

// ❌ Avoid
type MediaItem = { ... }; // for objects
enum MediaType { Anime, Manga } // use union
function getMedia(type: any): any;
```

### React

- **Function components + hooks** — No class components
- **Colocate** — Component, styles, tests in same folder
- **Props interface** — Name as `ComponentNameProps`
- **Children** — Use `React.ReactNode`, not `JSX.Element`

```tsx
// ✅ Good
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ variant = 'primary', size = 'md', children, onClick }: ButtonProps) {
  return <button className={cn(styles[variant], sizes[size])} onClick={onClick}>{children}</button>;
}
```

### CSS / Tailwind

- **Utility-first** — Use Tailwind classes, avoid custom CSS
- **CSS Variables** — For theming (see `reference/design-guidelines.md`)
- **Responsive** — Mobile-first (`md:`, `lg:`, `xl:`)
- **Dark mode** — Use `dark:` variant, test both

```tsx
// ✅ Good
<div className="glass-panel p-4 md:p-6 hover:glass-panel-hover transition-all duration-500">
  <h2 className="font-display text-xl font-extrabold text-foreground">Title</h2>
</div>

// ❌ Avoid custom CSS files for component styles
```

### File Organization

```
feature-folder/
├── Component.tsx          # Main component
├── Component.styles.css   # Only if CSS needed (rare)
├── Component.test.tsx     # Unit tests
├── Component.stories.tsx  # Storybook (if UI)
├── hooks/                 # Feature-specific hooks
│   └── useFeature.ts
├── types.ts               # Feature types
├── utils.ts               # Feature utilities
└── index.ts               # Public exports
```

---

## Git Workflow

### Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| **Feature** | `feat/<short-description>` | `feat/anime-calendar-filters` |
| **Fix** | `fix/<short-description>` | `fix/player-audio-track-persist` |
| **Refactor** | `refactor/<short-description>` | `refactor/extension-registry` |
| **Docs** | `docs/<short-description>` | `docs/architecture-overview` |
| **Chore** | `chore/<short-description>` | `chore/update-dependencies` |

### Commit Messages (Conventional Commits)

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| Type | Meaning |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change, no behavior change |
| `perf` | Performance improvement |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `test` | Adding tests |
| `chore` | Maintenance, deps, build |
| `ci` | CI/CD changes |

**Examples:**
```
feat(player): add theater mode toggle

Adds theater mode to video player with dimmed background
and auto-hide controls. Includes keyboard shortcut (T).

Closes #123

---

fix(extension): handle missing rendererEntry gracefully

Extension without renderer.js would crash renderer loader.
Now logs warning and continues loading data-driven contributions.

Fixes #456
```

---

## Pull Request Process

### Before Opening PR

1. **Sync with main:** `git fetch upstream && git rebase upstream/main`
2. **Run checks:** `pnpm lint && pnpm typecheck && pnpm test`
3. **Test manually** — Verify feature works in web + desktop
4. **Update docs** — If behavior changes, update relevant `.md` files

### PR Template

```markdown
## Description
Brief summary of changes.

## Type
- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Documentation
- [ ] Performance
- [ ] Test

## Testing
- [ ] Unit tests pass
- [ ] E2E tests pass (if applicable)
- [ ] Manual testing: [web / desktop / mobile]
- [ ] Screenshots/videos (for UI changes)

## Checklist
- [ ] Code follows style guide
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No console.log / debugger left
- [ ] TypeScript compiles without errors
```

### Review Process

1. **Automated checks** — CI runs lint, typecheck, tests, build
2. **Maintainer review** — At least 1 approval required
3. **Address feedback** — Push commits to same branch
4. **Squash & merge** — Maintainer merges with squash

---

## Testing Guidelines

### Unit Tests (Vitest)

```ts
// src/features/anime/hooks/__tests__/useAnimeDetail.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAnimeDetail } from '../useAnimeDetail';
import { createWrapper } from '@/test/utils';

describe('useAnimeDetail', () => {
  it('fetches and returns anime detail', async () => {
    const { result } = renderHook(() => useAnimeDetail('123'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      id: '123',
      title: expect.any(String),
    });
  });

  it('handles error gracefully', async () => {
    // Mock error response
    // ...
  });
});
```

### Integration Tests

- Test API integration with MSW (Mock Service Worker)
- Test extension loading with test fixtures

### E2E Tests (Playwright)

```ts
// e2e/watch-anime.spec.ts
import { test, expect } from '@playwright/test';

test('user can watch an anime episode', async ({ page }) => {
  await page.goto('/anime/123');
  await page.click('[data-testid="episode-1"]');
  await expect(page.locator('video')).toBeVisible();
  await expect(page.locator('[data-testid="player-controls"]')).toBeVisible();
});
```

---

## Extension Development

See [Extension System](extensions/overview.md) for full guide.

### Quick Checklist for Extension PRs

- [ ] `manifest.json` validates against schema
- [ ] Bundle builds without errors (`pnpm ext:build --filter=<name>`)
- [ ] Data-driven contributions work (sources, themes, analytics)
- [ ] Code-driven contributions guarded by trust (pages, slots, services)
- [ ] README with usage instructions
- [ ] Icon (512x512 PNG) included

---

## Reporting Issues

### Bug Report Template

```markdown
## Bug Description
Clear, concise description.

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. Scroll to '...'
4. See error

## Expected Behavior
What should happen.

## Actual Behavior
What happens (with error message, screenshot, video).

## Environment
- OS: [Windows 11 / macOS 14 / Ubuntu 22.04 / Android 14 / iOS 17]
- App Version: [e.g., 1.2.3]
- Platform: [Web / Desktop / Android / iOS]

## Logs
Paste relevant logs (DevTools console, Electron main process, extension host).
```

### Feature Request Template

```markdown
## Feature Description
What you'd like to see.

## Use Case
Why this is needed, who benefits.

## Proposed Solution
How it could work (optional).

## Alternatives Considered
Other approaches you've thought of.

## Additional Context
Mockups, references, related issues.
```

---

## Code Review Guidelines

### As Reviewer

- **Be constructive** — Explain *why*, not just *what*
- **Ask questions** — "What does this handle?" vs "This is wrong"
- **Approve when ready** — Don't nitpick style if CI passes
- **Focus on:** Correctness, security, performance, maintainability

### As Author

- **Small PRs** — Easier to review, faster to merge
- **Self-review first** — Catch obvious issues
- **Respond promptly** — Keep momentum
- **Don't take it personally** — Reviews improve code

---

## Release Process

1. **Version bump** — `pnpm version patch|minor|major`
2. **Changelog** — Auto-generated from conventional commits
3. **Tag** — `git push origin main --tags`
4. **CI builds** — All platforms (web, desktop, mobile)
5. **Publish** — GitHub Releases, Play Store, TestFlight
6. **Announce** — Discord, GitHub Discussions

---

## Community

- **Discord:** [discord.gg/tatakai](https://discord.gg/tatakai) — Chat, help, announcements
- **GitHub Discussions:** Questions, ideas, showcase
- **GitHub Issues:** Bugs, feature requests

---

## License

By contributing, you agree that your contributions will be licensed under the **MIT License** (same as the project).

---

*Questions? Ask in Discord or open a GitHub Discussion!*