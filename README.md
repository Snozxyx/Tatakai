# 🎬 Tatakai

A modern, feature-rich anime streaming platform built with React, TypeScript, and Supabase.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)
![React](https://img.shields.io/badge/React-18-blue)

## 🌟 Screenshots

### Homepage
![Tatakai Homepage](https://via.placeholder.com/1200x675/1a1b26/a9b1d6?text=Tatakai+Homepage+-+Coming+Soon)
*Browse trending anime, continue watching, and discover new series*

### Video Player
![Video Player](https://via.placeholder.com/1200x675/1a1b26/a9b1d6?text=Video+Player+-+Coming+Soon)
*Advanced video player with quality selection, subtitles, and AniSkip integration*

### Theme Gallery
Tatakai features 10 unique, beautifully crafted themes organized by category:

#### 🌙 Dark Themes
| Theme | Description | Preview |
|-------|-------------|---------|
| 🌙 **Midnight** | Classic dark with indigo & violet accents | ![Midnight](https://via.placeholder.com/200x100/2d2a4a/a9b1d6?text=Midnight) |
| 🌸 **Cherry Blossom** | Soft pink tones inspired by sakura | ![Cherry Blossom](https://via.placeholder.com/200x100/3d2033/f5c2e7?text=Cherry+Blossom) |
| 🗼 **Neon Tokyo** | Electric neon cyberpunk vibes | ![Neon Tokyo](https://via.placeholder.com/200x100/1a0e2e/bb9af7?text=Neon+Tokyo) |
| 🌋 **Volcanic** | Fiery lava with warm ember glow | ![Volcanic](https://via.placeholder.com/200x100/1e0f0a/ff6b35?text=Volcanic) |
| 🌊 **Deep Ocean** | Mysterious underwater depths | ![Deep Ocean](https://via.placeholder.com/200x100/0a1628/3daee9?text=Deep+Ocean) |
| 🌿 **Zen Garden** | Calm forest tranquility | ![Zen Garden](https://via.placeholder.com/200x100/0f1814/74c69d?text=Zen+Garden) |
| ⬛ **Brutalist Dark** | Bold, raw, minimalist aesthetic | ![Brutalist Dark](https://via.placeholder.com/200x100/141414/f7d94c?text=Brutalist+Dark) |
| 🌇 **Sunset Dreams** | Dreamy sunset with warm pink and orange | ![Sunset Dreams](https://via.placeholder.com/200x100/1f1410/ff8c69?text=Sunset+Dreams) |
| 🌌 **Aurora** | Magical aurora with teal and purple lights | ![Aurora](https://via.placeholder.com/200x100/0e1419/6dd5ed?text=Aurora) |

#### ☀️ Light Themes
| Theme | Description | Preview |
|-------|-------------|---------|
| ☀️ **Light Minimal** | Clean, bright, modern design | ![Light Minimal](https://via.placeholder.com/200x100/fafafa/4a5aef?text=Light+Minimal) |

### Search & Discovery
![Search Page](https://via.placeholder.com/1200x675/1a1b26/a9b1d6?text=Search+%26+Discovery+-+Coming+Soon)
*Powerful search with genre filters and advanced options*

### Community Features
![Community](https://via.placeholder.com/1200x675/1a1b26/a9b1d6?text=Community+Features+-+Coming+Soon)
*Engage with other anime fans through comments, ratings, and tier lists*

## ✨ Features

### 🎥 Core Features
- **Anime Streaming** - Watch anime with HLS video player and AniSkip integration
- **Search & Discovery** - Advanced search with genre filtering
- **Trending Section** - Random episode previews with HLS streaming
- **Continue Watching** - Track your progress across devices
- **Watchlist & Favorites** - Save and organize your anime
- **Comments & Ratings** - Engage with the community

### 👥 User Features
- **Authentication** - Secure sign up/sign in with Supabase Auth
- **User Profiles** - Customizable profiles with avatars
- **Watch History** - Track and resume your viewing progress
- **Multiple Themes** - 10 unique themes (9 dark, 1 light) with distinct visual identities
- **Privacy Controls** - Public/private profile settings

### 🛡️ Admin Features
- **User Management** - Ban/unban users, promote to admin
- **Maintenance Mode** - System-wide maintenance with admin bypass
- **Admin Messaging** - Broadcast or individual messages to users
- **Analytics Dashboard** - View user activity and stats
- **Comment Moderation** - Delete inappropriate comments

### 🎨 Design Features
- **Responsive Design** - Desktop, tablet, and mobile optimized
- **Smart TV Support** - Optimized for LG webOS, Samsung Tizen, Android TV
- **Beautiful UI** - Glassmorphic design with smooth animations
- **Theme System** - Dynamic theme switching with unique color schemes
- **Ad Blocking** - Built-in ad blocking for embed players

## 🚀 Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - UI component library
- **Framer Motion** - Animation library
- **React Query** - Server state management
- **React Router** - Client-side routing

### Backend
- **Supabase** - Backend as a Service
  - PostgreSQL database
  - Authentication
  - Row Level Security (RLS)
  - Real-time subscriptions
  
### Video
- **HLS.js** - HTTP Live Streaming playback
- **AniSkip API** - Skip intro/outro timestamps

### APIs
- **Consumet API** - Anime metadata and streaming links

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm/bun
- Supabase account

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/Snozxyx/anime-haven.git
cd anime-haven
```

2. **Install dependencies**
```bash
npm install
# or
bun install
```

3. **Environment Setup**

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
DATABASE_URL=your_database_url
```

4. **Database Setup**

Run the migrations in your Supabase SQL Editor:

```bash
# Run migrations in order:
# 1. supabase/migrations/20251231031018_remix_migration_from_pg_dump.sql
# 2. supabase/migrations/20250102000001_add_views_system.sql
# 3. supabase/migrations/20250115000001_add_views_system.sql
# 4. supabase/migrations/20250116000001_add_auth_trigger.sql
# 5. supabase/migrations/20260102000002_add_admin_features.sql
```

5. **Start Development Server**

```bash
npm run dev
# or
bun dev
```

Visit `http://localhost:5173`

## 🗄️ Database Schema

### Main Tables
- `profiles` - User profiles with admin/ban status
- `watch_history` - Continue watching progress
- `watchlist` - User's saved anime
- `comments` - User comments on anime
- `ratings` - User ratings for anime
- `views` - Anime view tracking
- `maintenance_mode` - System maintenance status
- `admin_messages` - Admin notification system

## 👨‍💼 Admin Setup

To make a user an admin, run this SQL in Supabase:

```sql
UPDATE public.profiles 
SET is_admin = true 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'admin@example.com'
);
```

## 🎨 Available Themes

Tatakai features 10 carefully curated themes, each with a distinct visual personality:

### Dark Themes (9 themes)
- **🌙 Midnight** - Classic dark with indigo & violet accents - perfect for nighttime viewing
- **🌸 Cherry Blossom** - Soft pink tones inspired by Japanese sakura season
- **🗼 Neon Tokyo** - Electric neon cyberpunk vibes with purple and cyan
- **🌋 Volcanic** - Fiery lava with warm orange and red ember glow
- **🌊 Deep Ocean** - Mysterious underwater depths with blue tones
- **🌿 Zen Garden** - Calm forest tranquility with green hues
- **⬛ Brutalist Dark** - Bold, raw, high-contrast minimalist aesthetic
- **🌇 Sunset Dreams** - Dreamy sunset with warm pink and orange gradients
- **🌌 Aurora** - Magical aurora with mesmerizing teal and purple lights

### Light Themes (1 theme)
- **☀️ Light Minimal** - Clean, bright, modern design for daytime use

Each theme is optimized for readability, aesthetics, and provides a unique viewing experience.

## 🔒 Security & Privacy Features

- Row Level Security (RLS) policies on all database tables
- Secure authentication via Supabase with email verification
- Admin-only routes and operations with role-based access
- Banned user flow with restricted access
- Private/public profile settings
- CORS protection and SQL injection prevention
- Ad-blocking for embed players with Content Security Policy
- Secure iframe sandboxing for video embeds

## 📱 Responsive Breakpoints

- **Mobile**: < 768px - Optimized touch interface with bottom navigation
- **Tablet**: 768px - 1024px - Adaptive layout with sidebar
- **Desktop**: > 1024px - Full-featured interface with side navigation
- **Smart TV**: Detected automatically - Large touch targets and enhanced focus states

## 🚀 Deployment

### Production Build

```bash
npm run build
# or
bun run build
```

The build output will be in the `dist` directory, ready for deployment to any static hosting service.

### Deployment Platforms

**Recommended platforms:**
- **Vercel** - Automatic deployments from Git
- **Netlify** - Continuous deployment with preview URLs
- **Cloudflare Pages** - Global CDN with edge computing
- **AWS Amplify** - Full-stack deployment with CI/CD
- **GitHub Pages** - Free hosting for public repositories

### Environment Variables

Make sure to set the following environment variables in your deployment platform:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Post-Deployment Checklist

- [ ] Verify all environment variables are set
- [ ] Test authentication flow
- [ ] Check video player functionality
- [ ] Verify database connections
- [ ] Test theme switching
- [ ] Validate mobile responsiveness
- [ ] Check admin panel access (if applicable)

## 📊 Analytics & Monitoring

The platform includes built-in analytics features:

- **User Activity Tracking** - Monitor page visits and user engagement
- **Video View Statistics** - Track anime popularity and viewing trends
- **Admin Dashboard** - Real-time metrics and user management
- **Error Monitoring** - Track and respond to issues quickly

## 🎮 Smart TV Features

Optimized experience for:
- **LG webOS** - Native TV interface support
- **Samsung Tizen** - Enhanced remote control navigation
- **Android TV** - Optimized for TV screens
- **Fire TV** - Amazon device compatibility

Features include:
- Large, easy-to-read text
- Remote-friendly navigation
- Enhanced focus indicators
- Simplified UI for 10-foot viewing

## 📝 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- [Consumet API](https://github.com/consumet/consumet.ts) - Anime data provider
- [AniSkip API](https://api.aniskip.com) - Skip timestamps
- [shadcn/ui](https://ui.shadcn.com) - UI components
- [Supabase](https://supabase.com) - Backend infrastructure

## 📧 Contact

For questions or support, please open an issue on GitHub.

---

Built with ❤️ by [Snozxyx](https://github.com/Snozxyx)
