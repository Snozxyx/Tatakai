# Tatakai

<div align="center">
  <img src="https://img.shields.io/badge/React-18.2.0-blue" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0.0-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-4.0.0-yellow" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind-3.0.0-blue" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Supabase-2.0.0-green" alt="Supabase" />
</div>

<div align="center">
  <h3>The Next Generation Anime Streaming Platform</h3>
  <p>Built with modern web technologies for an immersive anime experience</p>
</div>

## 📸 Preview

<div align="center">
  <h3>Home Page</h3>
  <img src="preview/Home.png" alt="Tatakai Home Page" width="800" />
  
  <h3>ML Recommendations</h3>
  <img src="preview/machinelearn.png" alt="Machine Learning Recommendations" width="800" />
  
  <h3>Community Features</h3>
  <img src="preview/Communtiy.png" alt="Community Page" width="800" />
  
  <h3>User Profile</h3>
  <img src="preview/Profile.png" alt="User Profile Page" width="800" />
</div>

## ✨ Features

- 🎬 **Streaming**: High-quality anime streaming with multiple sources
- 🤖 **AI Recommendations**: Personalized anime suggestions powered by machine learning
- 👥 **Social Features**: Follow users, create playlists, and engage with the community
- 📱 **Cross-Platform**: Responsive design that works on all devices
- 🎨 **Modern UI**: Beautiful, animated interface with dark theme
- 🔍 **Advanced Search**: Find anime by genre, status, rating, and more
- 📊 **Analytics**: Track your watching habits and get insights
- 🌐 **Multi-Source**: Aggregates content from multiple anime providers

## 🚀 Tech Stack

### Frontend
- **React 18** - Modern React with hooks and concurrent features
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Framer Motion** - Smooth animations and transitions
- **React Query** - Powerful data fetching and caching

### Backend & Database
- **Supabase** - Backend-as-a-Service with PostgreSQL
- **Row Level Security** - Database-level access control
- **Real-time subscriptions** - Live updates for social features

### Integrations
- **DataDog** - Application monitoring and logging
- **Google Analytics** - User analytics and tracking
- **Multiple Anime APIs** - Content aggregation from various sources

## 📋 Prerequisites

- Node.js 18+ and npm
- Git
- Supabase account (for backend)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/tatakai.git
   cd tatakai
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```

   Fill in your environment variables:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_GA_MEASUREMENT_ID=your_google_analytics_id
   VITE_DD_CLIENT_TOKEN=your_datadog_client_token
   ```

4. **Database Setup**
   ```sql
   -- Run the migrations in your Supabase SQL Editor
   -- See supabase/migrations/ for the migration files
   ```

5. **Start development server**
   ```bash
   npm run dev
   # or
   bun run dev
   ```

## 📁 Project Structure

```
tatakai/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/             # Base UI components
│   │   ├── layout/         # Layout components
│   │   ├── anime/          # Anime-specific components
│   │   └── ...
│   ├── pages/              # Page components
│   ├── hooks/              # Custom React hooks
│   ├── contexts/           # React contexts
│   ├── lib/                # Utility functions
│   └── services/           # API services
├── supabase/
│   ├── migrations/         # Database migrations
│   └── functions/          # Edge functions
├── public/                 # Static assets
└── docs/                   # Documentation
```

## 🎯 Key Components

### Core Features
- **Anime Streaming**: Watch anime with multiple quality options
- **Personal Recommendations**: ML-powered suggestions based on viewing history
- **Social Interaction**: Follow users, comment on anime, create tier lists
- **Playlist Management**: Create and share anime playlists
- **Community Forums**: Discuss anime with other fans

### Technical Highlights
- **Real-time Updates**: Live notifications and chat features
- **Offline Support**: Download anime for offline viewing
- **PWA Ready**: Installable as a progressive web app
- **Accessibility**: WCAG compliant with keyboard navigation

## 🔧 Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
```

### Code Quality

- **ESLint**: Code linting and formatting
- **Prettier**: Code formatting
- **TypeScript**: Strict type checking
- **Husky**: Git hooks for quality checks

## 🚀 Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push

### Manual Deployment
```bash
npm run build
# Deploy the dist/ folder to your hosting provider
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow the existing code style
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## 📄 License

This project is for educational purposes only. See individual components for their respective licenses.

## ⚠️ Disclaimer

This project is built for educational and portfolio purposes. It aggregates publicly available content from third-party sources. We do not host or distribute copyrighted material.

## 🙏 Acknowledgments

- Anime data provided by various public APIs
- UI inspiration from modern streaming platforms
- Community contributions and feedback

## 📞 Support

For questions or support, please open an issue on GitHub.

---

<div align="center">
  <p>Made with ❤️ for anime fans</p>
  <p>
    <a href="#features">Features</a> •
    <a href="#installation">Installation</a> •
    <a href="#contributing">Contributing</a>
  </p>
</div>