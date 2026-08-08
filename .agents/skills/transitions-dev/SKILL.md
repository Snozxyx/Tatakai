---
name: transitions-dev
description: Production-ready CSS transitions for web apps. Use when implementing notification badges, dropdowns, modals, panel reveals, page transitions, card resizes, number pop-ins, text swaps, icon swaps, success checks, avatar group hovers, or error state shakes. Triggers on "add a transition", "animate the dropdown", "make the modal open smoothly", "swap icon", "page slide", "stagger animation", "open / close transition", "make it animate", "tween the size", "fade between", "smooth open", "smooth close", "success animation", "checkmark animation", "confirmation animation", "form error", "shake on invalid", "validation feedback", "hover lift", "avatar stack hover", "chip group hover". Also exposes the namespaced verbs "transitions reveal", "transitions review", "transitions apply" and their natural-language paraphrases "review my transitions", "audit my animations with transitions-dev", "apply a transition here", "add the right transition", "reveal the available transitions", "list all transitions", "what transitions are available".
---

# Transitions.dev

Twelve portable CSS transitions, each namespaced under `t-*` selectors with semantic CSS custom properties. Drop-in: paste the snippet, wire the documented HTML hooks, done. No framework dependencies, no demo-specific markup, and every snippet ships a `prefers-reduced-motion` guard.

## Quick reference

| Transition | When to use | Reference |
| --- | --- | --- |
| **Card resize** | Tween a container's width or height when its layout state changes. | [01-card-resize.md](./01-card-resize.md) |
| **Number pop-in** | Re-enter each digit with a blurred slide when a number updates. | [02-number-pop-in.md](./02-number-pop-in.md) |
| **Notification badge** | Slide a small badge onto a trigger and pop the dot. | [03-notification-badge.md](./03-notification-badge.md) |
| **Text states swap** | Swap text in place with a blurred up-and-down transition. | [04-text-states-swap.md](./04-text-states-swap.md) |
| **Menu dropdown** | Open an origin-aware dropdown that grows from its trigger. | [05-menu-dropdown.md](./05-menu-dropdown.md) |
| **Modal open / close** | Scale-up modal dialog with a softer scale-down on close. | [06-modal.md](./06-modal.md) |
| **Panel reveal** | Slide a panel into a region with a cross-blur. | [07-panel-reveal.md](./07-panel-reveal.md) |
| **Page side-by-side** | Slide between two side-by-side pages (list ↔ detail, step 1 ↔ step 2). | [08-page-side-by-side.md](./08-page-side-by-side.md) |
| **Icon swap** | Cross-fade two icons in the same slot with blur and scale. | [09-icon-swap.md](./09-icon-swap.md) |
| **Success check** | Compose fade + rotate + Y-bob + path stroke-draw to celebrate a completed action. | [10-success-check.md](./10-success-check.md) |
| **Avatar group hover** | Distance-falloff lift on a row of items with a bouncy spring on return. | [11-avatar-group-hover.md](./11-avatar-group-hover.md) |
| **Error state shake** | Per-segment cubic-bezier shake with auto-reverting border + message. | [12-error-state-shake.md](./12-error-state-shake.md) |

## Decision rules

When the user asks for a transition, match against the visible UI element first, then the verb:

- **Trigger + small dot floating on top** → notification badge.
- **Trigger + surface that grows from it** → dropdown (anchored, origin-aware) or modal (centered, no anchor).
- **Surface that slides into a region of the page** → panel reveal.
- **Two screens, list ↔ detail or step 1 ↔ step 2** → page side-by-side.
- **Element changes width or height** → card resize.
- **Element's text content changes in place** → text states swap.
- **Two icons in the same slot** → icon swap.
- **A number updates** → number pop-in.
- **Confirmation / success / "done" moment** (checkmark, payment processed, file uploaded) → success check.
- **Hovering an item in a horizontal stack** (avatars, chips, segmented buttons, tag pills) → avatar group hover.
- **Form validation error / "this is wrong" feedback** (invalid field, wrong PIN, duplicate name) → error state shake.
- **No clear match** → fall back to `transitions reveal` and let the user pick. Don't guess.

If two transitions could fit, prefer the lower-overhead one (card resize over panel reveal, dropdown over modal, success check over a full modal celebration) unless the design clearly calls for the heavier surface. The success check is animation-only — if you also need to swap from a spinner to the check, pair it with **icon swap**.

## Commands

The skill exposes three namespaced verbs the agent should recognise in addition to direct transition requests. Every command starts with `transitions` so the invocation never collides with verbs from other skills installed in the same project.

### transitions reveal — list every transition

**Trigger phrases:** `transitions reveal`, "reveal the transitions", "list all transitions", "what transitions are in this skill", "show the transitions catalog".

**Behaviour:** print the twelve transitions as a numbered plain-text list — name, one-line summary, and the matching reference filename. Reuse the rows in `## Quick reference` above; do not invent new copy. No project access.

### transitions review — audit the project for fit

**Trigger phrases:** `transitions review`, "review my project", "audit my animations", "where would transitions.dev help", "find places to use this skill".

**Behaviour:**

1. Search the workspace for indicators: `transition:` declarations, `@keyframes`, hardcoded `ms` / `s` durations in style files, components matching the eleven decision-rule patterns (modals, dropdowns, badges, …).
2. For each hit, match against the decision rules and pick the single best-fit transition.
3. Output a numbered list grouped by file:
   - `path/to/Component.tsx:L42` — looks like a dropdown opening, suggest **menu-dropdown** (`05-menu-dropdown.md`).
   - Skip ad-hoc transitions that already use a `t-*` class.
4. Do not edit anything. End with: "Run `transitions apply` on any line to install the suggested transition."

### transitions apply — install the best-fit transition

**Trigger phrases:** `transitions apply`, "apply a transition here", "add the right transition", "install transitions-dev here", "fix the animation on this element".

**Behaviour:**

1. Read context: the currently-open file, the element nearest the cursor, surrounding CSS / JSX. If the user named a transition explicitly (e.g. `transitions apply menu-dropdown`), use it.
2. Run the decision rules from `## Decision rules` on that context and pick **one** transition. If two could fit, prefer the lower-overhead one (same tie-breaker the existing rules use).
3. Surface a one-line proposal: "I'd apply **menu-dropdown** here because the element opens from a trigger and is anchored. Confirm to install?".
4. On confirmation, follow the existing five-step procedure in `## Output format` verbatim (root block, snippet, hooks, reduced-motion guard, JS orchestration if needed).
5. If the agent can't pick a single transition with confidence, fall back to `transitions reveal` and ask the user to choose.

## Universal install

Drop this `:root` block into your project **once**. Every transition snippet reads from these semantic names — there are no per-component values to chase down later.

```css
/* transitions-dev — copy this :root block into your project once.
   Every transition snippet reads from these semantic names. */
:root {
  /* Card resize */
  --resize-dur: 300ms;
  --resize-ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* Number pop-in */
  --digit-dur: 500ms;
  --digit-distance: 8px;
  --digit-stagger: 70ms;
  --digit-blur: 2px;
  --digit-ease: cubic-bezier(0.34, 1.45, 0.64, 1);
  --digit-dir-x: 0;
  --digit-dir-y: 1;
  /* Notification badge */
  --badge-slide-dur: 260ms;
  --badge-pop-dur: 500ms;
  --badge-pop-close-dur: 180ms;
  --badge-fade-dur: 400ms;
  --badge-fade-close-dur: 180ms;
  --badge-blur: 2px;
  --badge-offset-x: -8.2px;
  --badge-offset-y: 12.4px;
  --badge-slide-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --badge-pop-ease: cubic-bezier(0.34, 1.36, 0.64, 1);
  --badge-close-ease: cubic-bezier(0.4, 0, 0.2, 1);
  /* Text states swap */
  --text-swap-dur: 150ms;
  --text-swap-translate-y: 4px;
  --text-swap-blur: 2px;
  --text-swap-ease: ease-in-out;
  /* Menu dropdown */
  --dropdown-open-dur: 250ms;
  --dropdown-close-dur: 150ms;
  --dropdown-pre-scale: 0.97;
  --dropdown-closing-scale: 0.99;
  --dropdown-ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* Modal open / close */
  --modal-open-dur: 250ms;
  --modal-close-dur: 150ms;
  --modal-scale: 0.96;
  --modal-scale-close: 0.96;
  --modal-ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* Panel reveal */
  --panel-open-dur: 400ms;
  --panel-close-dur: 350ms;
  --panel-translate-y: 100px;
  --panel-blur: 2px;
  --panel-ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* Page side-by-side */
  --page-slide-dur: 200ms;
  --page-fade-dur: 200ms;
  --page-slide-distance: 8px;
  --page-blur: 3px;
  --page-stagger: 0ms;
  --page-exit-enabled: 1;
  --page-slide-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --page-fade-ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* Icon swap */
  --icon-swap-dur: 200ms;
  --icon-swap-blur: 2px;
  --icon-swap-start-scale: 0.25;
  --icon-swap-ease: ease-in-out;
  /* Success check */
  --check-opacity-dur: 550ms;
  --check-rotate-dur: 550ms;
  --check-rotate-from: 80deg;
  --check-bob-dur: 450ms;
  --check-y-amount: 40px;
  --check-blur-dur: 500ms;
  --check-blur-from: 10px;
  --check-path-dur: 550ms;
  --check-path-delay: 80ms;
  --check-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --check-ease-opacity: cubic-bezier(0.22, 1, 0.36, 1);
  --check-ease-rotate: cubic-bezier(0.22, 1, 0.36, 1);
  --check-ease-bob: cubic-bezier(0.34, 1.35, 0.64, 1);
  --check-ease-path: cubic-bezier(0.22, 1, 0.36, 1);
  /* Avatar group hover */
  --avatar-lift: -4px;
  --avatar-dur: 320ms;
  --avatar-scale: 1.05;
  --avatar-falloff: 0.45;
  --avatar-ease-in: cubic-bezier(0.22, 1, 0.36, 1);
  --avatar-ease-out: cubic-bezier(0.34, 3.85, 0.64, 1);
  /* Error state shake */
  --shake-distance: 6px;
  --shake-overshoot: 4px;
  --shake-dur-a: 80ms;
  --shake-dur-b: 60ms;
  --shake-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --revert-hold: 3000ms;
  --revert-dur: 280ms;
}
```

The `--pX-*` source tokens used by the live demo at [transitions.dev](https://transitions.dev) are intentionally **not** exported here. Tunable values are renamed to semantic names (`--badge-*`, `--dropdown-*`, `--modal-*`, …) so the user owns the design vocabulary.

## Output format

When inserting a transition into the user's project:

1. **Add the `:root` block above** to the user's global stylesheet, but only if it isn't already there. If the user already imported the universal install block once, do **not** duplicate it.
2. **Paste the chosen transition's CSS verbatim** from the relevant reference file. Do not rewrite selectors, do not collapse the transition into shorthand, do not strip `will-change`. The snippets are tuned and tested.
3. **Wire the documented HTML hooks** — class names (`.t-dropdown`, `.t-modal`, `.t-success-check`, `.t-avatar`, `.t-input`, …) and state attributes (`data-open`, `data-state`, `data-page`, `.is-open`, `.is-closing`, `.is-exit`, `.is-enter-start`, `.is-animating`, `.is-error`, `.is-shaking`).
4. **Preserve the `@media (prefers-reduced-motion: reduce)` block.** Every snippet ships one. Removing it makes the component fail accessibility audits.
5. **For transitions that need JS** (dropdown, modal, text swap, number pop-in, page slide, success check, avatar group hover, error state shake), copy the small orchestration snippet from the reference file and adapt the selectors to the user's DOM. Keep the timing reads (`getComputedStyle(...)getPropertyValue("--…")`) so durations stay in sync with the `:root` values.

Keep the diff small: only edit the files needed to introduce the transition. Don't rename the user's existing variables, don't reformat unrelated CSS, don't pull in a motion library.

## Common mistakes to avoid

- **Stripping the close-state class cleanup** on dropdown/modal — without the `setTimeout` that removes `.is-closing`, the next open jumps from the closing scale instead of the resting pre-open scale.
- **Forgetting the reflow** in the text swap, number pop-in, success check replay, and error state shake — `void el.offsetWidth` (or `offsetHeight`) between class/attribute removal and re-addition is what guarantees the animation replays.
- **Animating a single container** instead of the inner pieces — for the badge, animate the dot, not the trigger; for page slide, animate the page sections, not the container.
- **Replacing `transition: …` with `transition: all`** — every snippet enumerates exact properties on purpose so unrelated style changes don't ride in for free.
- **Hardcoding the success check's `stroke-dasharray`** — the snippet ships `20` as a placeholder. Replace it with `path.getTotalLength()` rounded up by 1 for *your* path, otherwise the stroke pre-reveals or over-draws.
- **Setting `transition-timing-function` in CSS** for the avatar group hover — it has to be set inline in JS *before* the `--shift` / `--scale-active` writes so the bouncy ease-out only applies on `mouseleave`.
- **Mixing `.is-error` and `.is-shaking` into one class** for the error state shake — keeping them orthogonal is what allows the shake to replay (remove → reflow → re-add) without flickering the whole error treatment.

## Reference files

- [01-card-resize.md](./01-card-resize.md) — Card resize
- [02-number-pop-in.md](./02-number-pop-in.md) — Number pop-in
- [03-notification-badge.md](./03-notification-badge.md) — Notification badge
- [04-text-states-swap.md](./04-text-states-swap.md) — Text states swap
- [05-menu-dropdown.md](./05-menu-dropdown.md) — Menu dropdown
- [06-modal.md](./06-modal.md) — Modal open / close
- [07-panel-reveal.md](./07-panel-reveal.md) — Panel reveal
- [08-page-side-by-side.md](./08-page-side-by-side.md) — Page side-by-side
- [09-icon-swap.md](./09-icon-swap.md) — Icon swap
- [10-success-check.md](./10-success-check.md) — Success check
- [11-avatar-group-hover.md](./11-avatar-group-hover.md) — Avatar group hover
- [12-error-state-shake.md](./12-error-state-shake.md) — Error state shake
- [_root.css](./_root.css) — the universal install block on its own, ready to import directly.
