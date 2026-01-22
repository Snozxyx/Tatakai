# Design Guideline: Blossom Theme

This document defines the visual language and design system for the Tatakai web application, with a focus on the **Blossom (Cherry Blossom)** theme as the primary aesthetic.

## ✨ Core Philosophy
Tatakai aims for a **Premium, Cinematic, and Dynamic** user experience. The Blossom theme specifically brings a soft, atmospheric, yet high-tech feel to the platform, inspired by the beauty of Sakura and modern cyberpunk aesthetics.

---

## 🎨 Theme: Cherry Blossom
The Blossom theme is characterized by deep, rich pinks and roses set against a very dark, high-contrast background.

### Color Palette (HSL)
| Token | HSL Value | Description |
| :--- | :--- | :--- |
| **Primary** | `340 82% 65%` | Main brand color, used for accents and key actions. |
| **Secondary** | `320 70% 55%` | Complementary pink for gradients and depth. |
| **Accent** | `350 90% 70%` | High-impact highlights and calls to action. |
| **Background** | `340 15% 5%` | Deep obsidian-pink background. |
| **Foreground** | `340 5% 95%` | Clean, near-white text with a subtle pink tint. |
| **Card** | `340 12% 8%` | Surface color for panels and sections. |
| **Muted** | `340 10% 15%` | Secondary background for inactive elements. |

### Visual Effects
- **Gradients**: `from-pink-500 via-rose-500 to-fuchsia-600`
- **Glassmorphism**: Panels use `backdrop-blur-xl` with a subtle white-to-transparent gradient border (`hsl(var(--glass-border) / 0.1)`).
- **Glows**: Subtle shadows and text-glows using `--glow-primary` (`340 82% 65%`).

---

## Typography
We use two primary typefaces to balance readability and modern edge.

### 1. Outfit (Display)
- **Usage**: Headers, Titles, Hero Sections.
- **Vibe**: Geometric, clean, and futuristic.
- **Hierarchy**: Uses `font-extrabold` (800) or `font-black` (900) for high-impact titles.

### 2. Space Grotesk (Body)
- **Usage**: Body text, descriptions, metadata, navigation labels.
- **Vibe**: High-tech, slightly idiosyncratic, excellent legibility at small sizes.
- **Weights**: `300` (Light), `400` (Regular), `700` (Bold).

---

## 🧊 Key Components

### Glass Panel (`.glass-panel`)
The signature UI element for Tatakai.
```css
.glass-panel {
  position: relative;
  overflow: hidden;
  border-radius: 1.5rem; /* 3xl */
  border: 1px solid hsla(var(--border), 0.3);
  background: hsla(var(--card), 0.6);
  backdrop-filter: blur(20px);
}
```

### Interactive Hover (`.glass-panel-hover`)
Enhanced interaction for cards and buttons.
- **Transform**: `-translate-y-1`
- **Shadow**: `0 0 40px hsl(var(--primary) / 0.1)`
- **Duration**: 500ms

---

## ✨ Animations
Reusable classes to bring the interface to life.

| Class | Effect |
| :--- | :--- |
| `animate-float` | Gentle Y-axis floating and subtle rotation. |
| `animate-pulse-slow` | Slow opacity breathing for background elements. |
| `animate-shimmer` | A moving light streak across surfaces (loading states). |
| `animate-fade-in` | Clean entrance animation with slight upward translation. |
| `animate-glow-pulse` | Pulsing primary color box-shadow. |

---

## 📐 Layout Principles
- **Radius**: Large, friendly corner radii (`--radius: 1rem`) for a premium modern feel.
- **Spacing**: Use standard Tailwind spacing, prioritizing whitespace for a cinematic experience.
- **Density**: Moderate to airy, allowing visuals (posters, banners) to take center stage.
