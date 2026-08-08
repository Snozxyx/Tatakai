# Layout Components

This directory contains high-level layout components that define the structure and shell of the Tatakai application.

## Key Components

- **Header.tsx**: The main navigation header, handling search, notifications, and user profile access.
- **Sidebar.tsx**: Side navigation for desktop users.
- **MobileNav.tsx**: Bottom navigation bar for mobile and native app users.
- **Footer.tsx**: Global application footer (conditionally rendered in `MainLayout`).
- **Background.tsx**: Global background effects and themes.
- **MainLayout.tsx**: The primary wrapper component that orchestrates the overall page structure, sidebar, and footer.
- **OfflineGate.tsx**: Handles connectivity checks and displays the offline state.
- **TitleBar.tsx**: Custom window title bar for desktop (Electron/Tauri) apps.

## Design Patterns

- **Conditional Rendering**: Many layout elements are hidden on specific pages (e.g., Auth, Reader, 404) via the `hideFooter` logic in `MainLayout`.
- **Responsive Adaptation**: Components use `useIsNativeApp` and `useIsMobile` to adapt their appearance for web, desktop, and mobile platforms.
