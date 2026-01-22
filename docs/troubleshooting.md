
# Troubleshooting Guide

Common issues and their solutions when working with Tatakai.

## Installation Issues

### Node Version Errors

**Problem:** `Error: The engine "node" is incompatible`

**Solution:**
```bash
# Check current version
node --version

# Install Node 18+ using nvm
nvm install 18
nvm use 18

# Or update Node directly
# On Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Dependency Installation Failures

**Problem:** `npm install` fails with errors

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and lock files
rm -rf node_modules package-lock.json

# Reinstall
npm install

# Or use bun
bun install
```

### Bun-Specific Issues

**Problem:** Some packages don't work with bun

**Solution:**
```bash
# Use npm for specific packages
npm install <package-name>

# Or switch to npm entirely
rm bun.lockb
npm install
```

## Supabase Connection Issues

### Invalid API Credentials

**Problem:** `Invalid API key` or `Project not found`

**Solution:**
1. Verify `.env` file exists in root directory
2. Check credentials in Supabase dashboard:
   - Settings → API
   - Copy exact values
3. Ensure no trailing spaces in `.env`
4. Restart dev server after changing `.env`

```bash
# Verify env variables loaded
npm run dev
# Check console for Supabase URL
```

### RLS Policy Violations

**Problem:** `permission denied for table` errors

**Solution:**
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Disable RLS temporarily (development only!)
ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;

-- Or check policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Verify user authentication
SELECT auth.uid(); -- Should return user ID when logged in
```

### Connection Timeouts

**Problem:** Requests to Supabase timeout

**Solution:**
1. Check internet connection
2. Verify Supabase project is not paused
3. Check Supabase status: https://status.supabase.com
4. Increase timeout in client:

```typescript
const supabase = createClient(url, key, {
  db: {
    schema: 'public'
  },
  global: {
    headers: { 'x-custom-header': 'value' }
  },
  realtime: {
    timeout: 10000
  }
});
```

## Authentication Issues

### Sign Up Not Creating Profile

**Problem:** User signs up but no profile created

**Solution:**
```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Recreate trigger if missing
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, avatar_url)
  VALUES (
    new.id,
    new.email,
    'https://api.dicebear.com/7.x/avataaars/svg?seed=' || new.id
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Session Not Persisting

**Problem:** User logged out on page refresh

**Solution:**
```typescript
// Check if session is being restored
const { data: { session } } = await supabase.auth.getSession();

// Ensure auth state listener is set up
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (event === 'SIGNED_IN') {
        setUser(session?.user);
      }
      if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    }
  );

  return () => subscription.unsubscribe();
}, []);
```

### Password Reset Not Working

**Problem:** Reset email not received

**Solution:**
1. Check Supabase email settings
2. Verify redirect URL configured:
   - Authentication → URL Configuration
   - Add: `http://localhost:5173/reset-password`
3. Check spam folder
4. Use email template customization

## Video Playback Issues

### Video Not Loading

**Problem:** "Video failed to load" error

**Solution:**
```typescript
// Check streaming URL is valid
console.log('Stream URL:', streamUrl);

// Verify HLS.js loaded
if (!Hls.isSupported()) {
  console.error('HLS not supported');
  // Fallback to native playback
  video.src = streamUrl;
}

// Check CORS
// Some sources require proxy
const proxyUrl = `/api/proxy?url=${encodeURIComponent(streamUrl)}`;
```

### No Audio

**Problem:** Video plays but no sound

**Solution:**
```typescript
// Check if muted
video.muted = false;

// Check volume
video.volume = 1.0;

// Browser autoplay policy might mute
// User must interact with page first
```

### Stuttering/Buffering

**Problem:** Video playback choppy

**Solution:**
```typescript
// Adjust HLS config
const hls = new Hls({
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  maxBufferSize: 60 * 1000 * 1000,
  maxBufferHole: 0.5
});

// Lower quality
hls.currentLevel = 0; // Lowest quality
```

### Skip Times Not Working

**Problem:** AniSkip timestamps not loading

**Solution:**
```typescript
// Verify MAL ID is correct
console.log('MAL ID:', malId);

// Check API response
fetch(`https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}`)
  .then(res => res.json())
  .then(data => console.log('Skip times:', data))
  .catch(err => console.error('AniSkip error:', err));

// Handle not found
if (!skipData.found) {
  console.log('No skip times available for this episode');
}
```

## API Issues

### Consumet API Errors

**Problem:** Anime data not loading

**Solution:**
```typescript
// Check API status
fetch('https://api.consumet.org')
  .then(res => console.log('API Status:', res.status))
  .catch(err => console.error('API down:', err));

// Use fallback providers
const providers = ['gogoanime', 'zoro', 'animepahe'];

for (const provider of providers) {
  try {
    const data = await fetch(`https://api.consumet.org/anime/${provider}/${query}`);
    if (data.ok) return await data.json();
  } catch (err) {
    continue;
  }
}
```

### Rate Limiting

**Problem:** 429 Too Many Requests

**Solution:**
```typescript
// Implement exponential backoff
async function fetchWithRetry(url: string, retries = 3, delay = 1000) {
  try {
    const response = await fetch(url);
    
    if (response.status === 429 && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, retries - 1, delay * 2);
    }
    
    return response;
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, retries - 1, delay * 2);
    }
    throw error;
  }
}
```

### CORS Errors

**Problem:** Blocked by CORS policy

**Solution:**
```typescript
// Use Supabase edge function proxy
const response = await fetch(
  `${supabaseUrl}/functions/v1/video-proxy`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`
    },
    body: JSON.stringify({ url: targetUrl })
  }
);
```

## UI/Styling Issues

### Tailwind Classes Not Working

**Problem:** Styles not applying

**Solution:**
```bash
# Ensure Tailwind is processing files
# Check tailwind.config.ts

# Content paths should include all component files
content: [
  "./index.html",
  "./src/**/*.{js,ts,jsx,tsx}",
],

# Restart dev server
npm run dev
```

### Dark Mode Issues

**Problem:** Theme not switching

**Solution:**
```typescript
// Check if class applied to html element
document.documentElement.classList.contains('dark');

// Verify theme provider wraps app
<ThemeProvider defaultTheme="dark">
  <App />
</ThemeProvider>

// Check localStorage
localStorage.getItem('theme');
```

### Mobile Responsiveness

**Problem:** Layout broken on mobile

**Solution:**
```bash
# Test responsive breakpoints
# Open DevTools → Toggle device toolbar
# Test at: 375px, 768px, 1024px, 1920px

# Use responsive Tailwind classes
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
```

## Performance Issues

### Slow Initial Load

**Problem:** App takes long to load

**Solution:**
```typescript
// Implement code splitting
const AdminPage = lazy(() => import('./pages/AdminPage'));
const WatchPage = lazy(() => import('./pages/WatchPage'));

// Use Suspense
<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/admin" element={<AdminPage />} />
  </Routes>
</Suspense>
```

### Memory Leaks

**Problem:** Browser becomes slow over time

**Solution:**
```typescript
// Clean up subscriptions
useEffect(() => {
  const subscription = supabase
    .channel('comments')
    .on('postgres_changes', {...}, handler)
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}, []);

// Clean up intervals/timeouts
useEffect(() => {
  const interval = setInterval(() => {...}, 1000);
  return () => clearInterval(interval);
}, []);
```

### Large Bundle Size

**Problem:** Build output too large

**Solution:**
```typescript
// Analyze bundle
npm run build
npx vite-bundle-visualizer

// Split vendor chunks
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom'],
        'ui-vendor': ['@radix-ui/react-*']
      }
    }
  }
}
```

## Database Issues

### Migration Failures

**Problem:** Migration fails to run

**Solution:**
```sql
-- Check migration status
SELECT * FROM schema_migrations;

-- Rollback failed migration
-- Find the migration version
DELETE FROM schema_migrations WHERE version = '20250102000001';

-- Fix SQL errors in migration file
-- Re-run migration
```

### Duplicate Key Errors

**Problem:** `duplicate key value violates unique constraint`

**Solution:**
```sql
-- Check existing data
SELECT * FROM table_name WHERE unique_column = 'value';

-- Delete duplicate if safe
DELETE FROM table_name WHERE id = 'duplicate_id';

-- Or use UPSERT
INSERT INTO table_name (...)
VALUES (...)
ON CONFLICT (unique_column) 
DO UPDATE SET ...;
```

### Table Doesn't Exist

**Problem:** `relation "table_name" does not exist`

**Solution:**
```sql
-- List all tables
\dt

-- Check schema
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Run migrations
-- supabase/migrations/*.sql
```

## Build/Deploy Issues

### Build Fails in Production

**Problem:** Production build fails but dev works

**Solution:**
```bash
# Test production build locally
npm run build
npm run preview

# Check for TypeScript errors
npm run type-check

# Fix any "implicit any" errors
# Enable strict mode in tsconfig.json
```

### Environment Variables Not Working

**Problem:** Variables undefined in production

**Solution:**
```bash
# Verify VITE_ prefix
VITE_SUPABASE_URL=... ✓
SUPABASE_URL=...     ✗

# Check platform env vars
# Vercel: Settings → Environment Variables
# Netlify: Site settings → Build & deploy → Environment

# Redeploy after adding variables
```

### 404 on Page Refresh

**Problem:** Direct URL navigation gives 404

**Solution:**
```javascript
// For Vercel, create vercel.json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}

// For Netlify, create _redirects
/*    /index.html   200

// For nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## Getting More Help

### Enable Debug Mode

```typescript
// Add to main.tsx
if (import.meta.env.DEV) {
  console.log('Debug mode enabled');
  window.supabase = supabase; // Access in console
}
```

### Check Browser Console

Press F12 and check:
- Console tab for errors
- Network tab for failed requests
- Application tab for localStorage

### Community Support

- Open issue on [GitHub](https://github.com/Snozxyx/Tatakai/issues)
- Check existing issues first
- Provide error messages and steps to reproduce

### Useful Commands

```bash
# Clear all caches
rm -rf node_modules dist .vite
npm cache clean --force
npm install

# Reset Supabase local
supabase stop
supabase start

# Check ports in use
lsof -i :5173
lsof -i :54321

# View logs
npm run dev -- --debug
```
