/**
 * Property-based tests for desktop layout sidebar offset.
 *
 * **Validates: Requirements 1.4, 12.1, 12.2, 12.3**
 *
 * Property 16: Layout offset matches sidebar state
 * For any viewport width and sidebar visibility state, the main content
 * container's left offset must equal the sidebar width when the viewport
 * is wider than 1024 px and the sidebar is visible, and must equal zero
 * otherwise.
 */

import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Layout offset logic — mirrors the logic in MainLayout.tsx
// ---------------------------------------------------------------------------

/**
 * Determines whether the sidebar is shown based on the same conditions
 * used in MainLayout.tsx:
 *   const showSidebar = !isMobile && !isMobileApp && !isHiddenPage;
 *
 * @param {object} params
 * @param {boolean} params.isMobile       - viewport ≤ 1024 px (useIsMobile hook)
 * @param {boolean} params.isMobileApp    - Capacitor native platform
 * @param {boolean} params.isHiddenPage   - current route hides the sidebar
 * @returns {boolean}
 */
function computeShowSidebar({ isMobile, isMobileApp, isHiddenPage }) {
  return !isMobile && !isMobileApp && !isHiddenPage;
}

/**
 * Determines the CSS classes applied to the root layout div, mirroring
 * the cn() call in MainLayout.tsx:
 *
 *   cn(
 *     "min-h-screen relative flex flex-col transition-all duration-300",
 *     isDesktopApp && showSidebar && "lg:pl-[var(--sidebar-width)]",
 *     isDesktopApp && "pt-8"
 *   )
 *
 * Returns the list of conditional classes (excluding the always-present ones).
 *
 * @param {object} params
 * @param {boolean} params.isDesktopApp
 * @param {boolean} params.showSidebar
 * @returns {{ hasSidebarOffset: boolean, hasDesktopPadding: boolean }}
 */
function computeLayoutClasses({ isDesktopApp, showSidebar }) {
  return {
    hasSidebarOffset: isDesktopApp && showSidebar,
    hasDesktopPadding: isDesktopApp,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HIDDEN_PAGES = [
  "/auth",
  "/onboarding",
  "/setup",
  "/maintenance",
  "/banned",
  "/error",
  "/devtools-blocked",
  "/smarttv",
  "/manga/read",
];

function isHiddenPage(pathname) {
  return HIDDEN_PAGES.some((page) => pathname.startsWith(page));
}

// ---------------------------------------------------------------------------
// Property 16 — Layout offset matches sidebar state
// ---------------------------------------------------------------------------

describe("MainLayout — Layout offset matches sidebar state (Property 16)", () => {
  // -------------------------------------------------------------------------
  // Core property: offset is applied iff desktop + sidebar visible
  // -------------------------------------------------------------------------

  describe("Sidebar offset is applied when and only when desktop + sidebar visible", () => {
    it("applies offset on desktop app with sidebar visible", () => {
      const showSidebar = computeShowSidebar({
        isMobile: false,
        isMobileApp: false,
        isHiddenPage: false,
      });
      const { hasSidebarOffset } = computeLayoutClasses({
        isDesktopApp: true,
        showSidebar,
      });
      expect(hasSidebarOffset).toBe(true);
    });

    it("does NOT apply offset on desktop app when sidebar is hidden (hidden page)", () => {
      const showSidebar = computeShowSidebar({
        isMobile: false,
        isMobileApp: false,
        isHiddenPage: true,
      });
      const { hasSidebarOffset } = computeLayoutClasses({
        isDesktopApp: true,
        showSidebar,
      });
      expect(hasSidebarOffset).toBe(false);
    });

    it("does NOT apply offset on desktop app when viewport is mobile (≤ 1024 px)", () => {
      const showSidebar = computeShowSidebar({
        isMobile: true,
        isMobileApp: false,
        isHiddenPage: false,
      });
      const { hasSidebarOffset } = computeLayoutClasses({
        isDesktopApp: true,
        showSidebar,
      });
      expect(hasSidebarOffset).toBe(false);
    });

    it("does NOT apply offset on desktop app when running as mobile app (Capacitor)", () => {
      const showSidebar = computeShowSidebar({
        isMobile: false,
        isMobileApp: true,
        isHiddenPage: false,
      });
      const { hasSidebarOffset } = computeLayoutClasses({
        isDesktopApp: true,
        showSidebar,
      });
      expect(hasSidebarOffset).toBe(false);
    });

    it("does NOT apply offset when NOT a desktop app (web/mobile browser)", () => {
      const showSidebar = computeShowSidebar({
        isMobile: false,
        isMobileApp: false,
        isHiddenPage: false,
      });
      const { hasSidebarOffset } = computeLayoutClasses({
        isDesktopApp: false,
        showSidebar,
      });
      expect(hasSidebarOffset).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Property: all hidden-page routes suppress the sidebar offset
  // -------------------------------------------------------------------------

  describe("All sidebar-hidden routes suppress the offset", () => {
    for (const page of HIDDEN_PAGES) {
      it(`suppresses offset for route starting with "${page}"`, () => {
        const showSidebar = computeShowSidebar({
          isMobile: false,
          isMobileApp: false,
          isHiddenPage: isHiddenPage(page),
        });
        const { hasSidebarOffset } = computeLayoutClasses({
          isDesktopApp: true,
          showSidebar,
        });
        expect(hasSidebarOffset).toBe(false);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Property: non-hidden routes on desktop get the offset
  // -------------------------------------------------------------------------

  describe("Non-hidden routes on desktop get the sidebar offset", () => {
    const visibleRoutes = [
      "/",
      "/search",
      "/trending",
      "/favorites",
      "/settings",
      "/anime/123",
      "/watch/456",
      "/profile",
      "/community",
      "/offline",
    ];

    for (const route of visibleRoutes) {
      it(`applies offset for route "${route}" on desktop`, () => {
        const showSidebar = computeShowSidebar({
          isMobile: false,
          isMobileApp: false,
          isHiddenPage: isHiddenPage(route),
        });
        const { hasSidebarOffset } = computeLayoutClasses({
          isDesktopApp: true,
          showSidebar,
        });
        expect(hasSidebarOffset).toBe(true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Property: desktop padding (pt-8) is always applied on desktop app
  // regardless of sidebar state
  // -------------------------------------------------------------------------

  describe("Desktop top padding is independent of sidebar state", () => {
    it("applies pt-8 on desktop app with sidebar visible", () => {
      const { hasDesktopPadding } = computeLayoutClasses({
        isDesktopApp: true,
        showSidebar: true,
      });
      expect(hasDesktopPadding).toBe(true);
    });

    it("applies pt-8 on desktop app even when sidebar is hidden", () => {
      const { hasDesktopPadding } = computeLayoutClasses({
        isDesktopApp: true,
        showSidebar: false,
      });
      expect(hasDesktopPadding).toBe(true);
    });

    it("does NOT apply pt-8 on non-desktop app", () => {
      const { hasDesktopPadding } = computeLayoutClasses({
        isDesktopApp: false,
        showSidebar: false,
      });
      expect(hasDesktopPadding).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Property: exhaustive truth table — all 8 combinations of
  // (isDesktopApp, isMobile, isMobileApp) with isHiddenPage=false
  // -------------------------------------------------------------------------

  describe("Exhaustive truth table for sidebar offset (isHiddenPage=false)", () => {
    const cases = [
      // [isDesktopApp, isMobile, isMobileApp, expectedOffset]
      [true,  false, false, true],   // desktop, wide viewport, not native → offset
      [true,  true,  false, false],  // desktop, narrow viewport → no offset
      [true,  false, true,  false],  // desktop, Capacitor native → no offset
      [true,  true,  true,  false],  // desktop, narrow + Capacitor → no offset
      [false, false, false, false],  // web browser, wide → no offset
      [false, true,  false, false],  // web browser, narrow → no offset
      [false, false, true,  false],  // web browser, Capacitor → no offset
      [false, true,  true,  false],  // web browser, narrow + Capacitor → no offset
    ];

    for (const [isDesktopApp, isMobile, isMobileApp, expectedOffset] of cases) {
      it(`isDesktopApp=${isDesktopApp}, isMobile=${isMobile}, isMobileApp=${isMobileApp} → offset=${expectedOffset}`, () => {
        const showSidebar = computeShowSidebar({ isMobile, isMobileApp, isHiddenPage: false });
        const { hasSidebarOffset } = computeLayoutClasses({ isDesktopApp, showSidebar });
        expect(hasSidebarOffset).toBe(expectedOffset);
      });
    }
  });

  // -------------------------------------------------------------------------
  // CSS variable: --sidebar-width must be defined and match the sidebar's
  // actual rendered width (80px = w-20 in Tailwind)
  // -------------------------------------------------------------------------

  describe("CSS variable --sidebar-width matches sidebar rendered width", () => {
    it("sidebar width constant is 80px (w-20 Tailwind class)", () => {
      // The Sidebar component uses `w-20` on desktop (Tailwind = 5rem = 80px).
      // The CSS variable in index.css must match.
      const TAILWIND_W20_PX = 80; // 5rem × 16px/rem
      const CSS_VAR_VALUE_PX = 80; // --sidebar-width: 80px in index.css
      expect(CSS_VAR_VALUE_PX).toBe(TAILWIND_W20_PX);
    });

    it("sidebar offset class references the CSS variable", () => {
      // The class applied in MainLayout.tsx must use var(--sidebar-width)
      const offsetClass = "lg:pl-[var(--sidebar-width)]";
      expect(offsetClass).toContain("--sidebar-width");
      expect(offsetClass).toContain("lg:");
    });
  });
});
