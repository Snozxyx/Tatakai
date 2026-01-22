# Architecture

This document describes the architecture and design patterns used in Tatakai.

## System Overview

```
┌─────────────────┐
│   React App     │
│   (Frontend)    │
└────────┬────────┘
         │
         │ HTTP/WebSocket
         │
┌────────┴────────┐
│   Supabase      │
│   (Backend)     │
├─────────────────┤
│ • Auth          │
│ • PostgreSQL    │
│ • Storage       │
│ • Realtime      │
└────────┬────────┘
         │
         │ API Calls
         │
┌────────┴────────┐
│  External APIs  │
├─────────────────┤
│ • Consumet API  │
│ • AniSkip API   │
└─────────────────┘
```

## Frontend Architecture

### Component Structure

```
src/
├── components/
│   ├── anime/           # Anime-specific components
│   │   ├── AnimeGrid.tsx
│   │   ├── HeroSection.tsx
│   │   └── VideoBackground.tsx
│   ├── layout/          # Layout components
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── MobileNav.tsx
│   ├── ui/              # Reusable UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   └── ...
│   └── video/           # Video player components
│       ├── VideoPlayer.tsx
│       └── VideoSettingsPanel.tsx
├── contexts/            # React Context providers
│   └── AuthContext.tsx
├── hooks/               # Custom hooks
│   ├── useAnimeData.ts
│   ├── useWatchHistory.ts
│   └── useTheme.ts
├── pages/               # Page-level components
│   ├── Index.tsx
│   ├── AnimePage.tsx
│   └── WatchPage.tsx
├── lib/                 # Utilities and helpers
│   ├── api.ts
│   └── utils.ts
└── integrations/        # Third-party integrations
    └── supabase/
```

### Design Patterns

#### 1. Component Composition

Components are built using composition for maximum reusability:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content here
  </CardContent>
</Card>
```

#### 2. Custom Hooks

Business logic is extracted into custom hooks:

```tsx
// useAnimeData.ts
export const useAnimeData = (animeId: string) => {
  const [anime, setAnime] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch anime data
  }, [animeId]);
  
  return { anime, loading };
};
```

#### 3. Context for Global State

Authentication and theme state are managed via Context:

```tsx
<AuthProvider>
  <ThemeProvider>
    <App />
  </ThemeProvider>
</AuthProvider>
```

## Backend Architecture

### Supabase Services

#### 1. Authentication
- Email/password authentication
- JWT tokens for session management
- Row Level Security (RLS) for authorization

#### 2. Database (PostgreSQL)
- Structured relational data
- RLS policies for data access control
- Triggers for automated tasks

#### 3. Realtime
- Live updates for comments
- Watch history synchronization
- Admin messages broadcast

#### 4. Edge Functions
- Video proxy for CORS handling
- Custom API endpoints

### Database Design

Tables are organized with RLS policies:

```
profiles (User data)
  ├── watch_history (Continue watching)
  ├── watchlist (Saved anime)
  ├── comments (User comments)
  ├── ratings (User ratings)
  └── admin_messages (Admin notifications)
```

## Data Flow

### User Authentication Flow

```
1. User enters credentials
   ↓
2. Supabase Auth validates
   ↓
3. JWT token issued
   ↓
4. Profile created/fetched
   ↓
5. User redirected to app
```

### Anime Watching Flow

```
1. User clicks anime
   ↓
2. Fetch metadata (Consumet API)
   ↓
3. Load video player
   ↓
4. Fetch streaming URL
   ↓
5. Load HLS stream
   ↓
6. Track watch progress
   ↓
7. Update watch history (Supabase)
```

### Comment System Flow

```
1. User writes comment
   ↓
2. Submit to Supabase
   ↓
3. RLS checks permissions
   ↓
4. Save to database
   ↓
5. Realtime broadcast
   ↓
6. Update UI for all users
```

## State Management

### Local State
- Component-specific state using `useState`
- Form state with controlled components

### Server State
- API data cached with React Query
- Automatic revalidation and background updates

### Global State
- Authentication via `AuthContext`
- Theme settings via `useTheme` hook
- Persisted in localStorage

## Performance Optimizations

### 1. Code Splitting
- Lazy loading of routes
- Dynamic imports for heavy components

```tsx
const AdminPage = lazy(() => import('./pages/AdminPage'));
```

### 2. Memoization
- `React.memo` for expensive components
- `useMemo` for computed values
- `useCallback` for stable function references

### 3. Image Optimization
- Lazy loading images
- Responsive image sizes
- Placeholder images

### 4. Virtual Scrolling
- Large lists rendered efficiently
- Only visible items in DOM

## Security Architecture

### Frontend Security
- Input sanitization
- XSS prevention
- CSRF tokens
- Secure cookie handling

### Backend Security
- Row Level Security (RLS)
- JWT verification
- SQL injection prevention
- Rate limiting (Supabase built-in)

### RLS Policies Example

```sql
-- Users can only read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);
```

## API Integration

### Consumet API
- Anime metadata
- Episode listings
- Streaming sources
- Search functionality

### AniSkip API
- Skip timestamps
- Opening detection
- Ending detection

### Error Handling

```tsx
try {
  const data = await fetchAnime(id);
  setAnime(data);
} catch (error) {
  if (error.response?.status === 404) {
    // Handle not found
  } else if (error.response?.status === 500) {
    // Handle server error
  } else {
    // Handle other errors
  }
}
```

## Testing Strategy

### Unit Tests
- Component testing with React Testing Library
- Hook testing
- Utility function tests

### Integration Tests
- User flow testing
- API integration tests
- Database operation tests

### E2E Tests
- Critical user journeys
- Authentication flows
- Video playback

## Deployment Architecture

### Production Build
```
Vite Build
  ↓
Static Assets
  ↓
CDN/Hosting (Vercel, Netlify)
  ↓
Edge Network
```

### Environment Configuration
- Development: Local Supabase
- Staging: Staging Supabase project
- Production: Production Supabase project

## Monitoring and Logging

### Frontend
- Error boundaries for crash recovery
- Console logging in development
- Analytics tracking (optional)

### Backend
- Supabase dashboard logs
- Database query performance
- API response times

## Future Improvements

- [ ] PWA support for offline access
- [ ] Service workers for caching
- [ ] GraphQL for optimized queries
- [ ] Microservices architecture
- [ ] CDN for static assets
- [ ] Redis caching layer
