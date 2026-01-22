# Getting Started

This guide will help you set up and run Tatakai on your local machine.

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18 or higher
- **npm** or **bun** package manager
- **Git** for version control
- **Supabase account** (free tier is sufficient)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Snozxyx/Tatakai.git
cd Tatakai
```

### 2. Install Dependencies

Using npm:
```bash
npm install
```

Or using bun:
```bash
bun install
```

### 3. Environment Setup

Create a `.env` file in the root directory:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Database URL (optional, for direct database access)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT].supabase.co:5432/postgres
```

#### Getting Supabase Credentials:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create a new project or select existing one
3. Navigate to **Settings** → **API**
4. Copy the **Project URL** (for VITE_SUPABASE_URL)
5. Copy the **anon/public** key (for VITE_SUPABASE_ANON_KEY)

### 4. Database Setup

Run the migrations in your Supabase SQL Editor in this order:

1. **Initial Schema**
   - File: `supabase/migrations/20251231031018_remix_migration_from_pg_dump.sql`
   - This creates all base tables and RLS policies

2. **Admin Features**
   - File: `supabase/migrations/20250102000001_add_admin_gabhastigirisinha.sql`
   - Adds initial admin user

3. **Views System**
   - File: `supabase/migrations/20250115000001_add_views_system.sql`
   - Adds view tracking functionality

4. **Auth Trigger**
   - File: `supabase/migrations/20250116000001_add_auth_trigger.sql`
   - Sets up automatic profile creation

5. **Enhanced Admin**
   - File: `supabase/migrations/20260102000002_add_admin_features.sql`
   - Adds messaging and maintenance features

### 5. Start Development Server

```bash
npm run dev
# or
bun dev
```

The application will be available at `http://localhost:5173`

## Project Structure

```
Tatakai/
├── src/
│   ├── components/      # React components
│   │   ├── anime/       # Anime-related components
│   │   ├── layout/      # Layout components (Header, Sidebar)
│   │   ├── ui/          # shadcn/ui components
│   │   └── video/       # Video player components
│   ├── contexts/        # React contexts (Auth, Theme)
│   ├── hooks/           # Custom React hooks
│   ├── integrations/    # Third-party integrations
│   │   └── supabase/    # Supabase client
│   ├── lib/             # Utility functions
│   ├── pages/           # Page components
│   └── main.tsx         # Application entry point
├── supabase/
│   ├── migrations/      # Database migrations
│   └── functions/       # Edge functions
├── public/              # Static assets
└── docs/                # Documentation
```

## Development Workflow

### Running the App

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Using Bun (Alternative)

```bash
bun dev          # Start development server
bun run build    # Build for production
bun run preview  # Preview production build
```

## Common Issues

### Port Already in Use

If port 5173 is already in use:

```bash
# Kill the process using the port
lsof -ti:5173 | xargs kill -9

# Or specify a different port
npm run dev -- --port 3000
```

### Supabase Connection Issues

1. Verify your `.env` file has correct credentials
2. Check if your Supabase project is active
3. Ensure API keys haven't expired
4. Check network connectivity

### Build Errors

Clear cache and reinstall:

```bash
rm -rf node_modules
rm package-lock.json
npm install
```

## Next Steps

- [Set up authentication](./authentication.md)
- [Configure admin access](./admin-features.md)
- [Customize themes](./theming.md)
- [Deploy to production](./deployment.md)

## Additional Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
