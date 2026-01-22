# Deployment Guide

This guide covers deploying Tatakai to production.

## Prerequisites

- Supabase project (production instance)
- Git repository
- Domain name (optional)

## Deployment Platforms

### Option 1: Vercel (Recommended)

#### Setup

1. **Push to GitHub**
```bash
git push origin main
```

2. **Import to Vercel**
- Go to [vercel.com](https://vercel.com)
- Click "Import Project"
- Select your repository
- Configure project

3. **Environment Variables**

Add in Vercel dashboard:
```env
VITE_SUPABASE_URL=your_production_supabase_url
VITE_SUPABASE_ANON_KEY=your_production_supabase_anon_key
```

4. **Build Settings**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

5. **Deploy**

Vercel will automatically deploy on push to main branch.

#### Custom Domain

1. Add domain in Vercel dashboard
2. Configure DNS records:
```
A Record: @ → 76.76.21.21
CNAME: www → cname.vercel-dns.com
```

### Option 2: Netlify

#### Setup

1. **Create netlify.toml**
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"
```

2. **Deploy via CLI**
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

3. **Environment Variables**

Add in Netlify dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Option 3: GitHub Pages

#### Setup

1. **Install gh-pages**
```bash
npm install --save-dev gh-pages
```

2. **Update package.json**
```json
{
  "homepage": "https://username.github.io/Tatakai",
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
```

3. **Update vite.config.ts**
```typescript
export default defineConfig({
  base: '/Tatakai/',
  // ... other config
});
```

4. **Deploy**
```bash
npm run deploy
```

### Option 4: Docker

#### Dockerfile
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### nginx.conf
```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # Cache static assets
  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
```

#### Build and Run
```bash
# Build image
docker build -t tatakai .

# Run container
docker run -p 80:80 tatakai
```

#### Docker Compose
```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "80:80"
    environment:
      - VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
      - VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
    restart: unless-stopped
```

## Supabase Production Setup

### 1. Create Production Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create new project
3. Choose region closest to users
4. Set strong database password

### 2. Run Migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

Or manually via SQL Editor:
1. Open SQL Editor in Supabase dashboard
2. Run each migration file in order
3. Verify tables created

### 3. Configure Authentication

#### Email Settings
1. Go to **Authentication** → **Email Templates**
2. Customize confirmation email
3. Set sender email

#### URL Configuration
1. **Authentication** → **URL Configuration**
2. Site URL: `https://yourdomain.com`
3. Redirect URLs: Add production domains

### 4. Storage Setup (Optional)

If using Supabase Storage:
```sql
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Set RLS policies
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

### 5. Edge Functions (Optional)

Deploy video-proxy function:
```bash
supabase functions deploy video-proxy
```

Deploy watchanimeworld-scraper function:
```bash
supabase functions deploy watchanimeworld-scraper
```

Set WatchAnimeWorld scraper environment variables:
```bash
supabase secrets set WATCHAW_CACHE_TTL=600
supabase secrets set WATCHAW_RATE_LIMIT=30
```

## Environment Variables

### Production .env

Never commit to git! Use platform's environment variable settings.

```env
# Supabase
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional
VITE_APP_URL=https://yourdomain.com
VITE_ENABLE_ANALYTICS=true
```

## Performance Optimization

### 1. Build Optimization

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          'supabase': ['@supabase/supabase-js']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
});
```

### 2. Image Optimization

Use responsive images:
```tsx
<img
  src={image}
  srcSet={`${image}?w=300 300w, ${image}?w=600 600w, ${image}?w=1200 1200w`}
  sizes="(max-width: 768px) 300px, (max-width: 1200px) 600px, 1200px"
  alt={title}
  loading="lazy"
/>
```

### 3. Caching Strategy

#### Service Worker (Optional)
```javascript
// sw.js
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('tatakai-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/assets/index.css',
        '/assets/index.js'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
```

### 4. CDN Configuration

For Vercel/Netlify:
- Automatic CDN distribution
- Edge caching enabled by default

For custom hosting:
- Use Cloudflare CDN
- Configure caching rules
- Enable minification

## Monitoring

### 1. Error Tracking

#### Sentry Integration
```bash
npm install @sentry/react
```

```typescript
// main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: "production",
  tracesSampleRate: 1.0,
});
```

### 2. Analytics

#### Vercel Analytics
```bash
npm install @vercel/analytics
```

```typescript
import { Analytics } from '@vercel/analytics/react';

<App />
<Analytics />
```

#### Google Analytics
```html
<!-- index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### 3. Uptime Monitoring

Use services like:
- [UptimeRobot](https://uptimerobot.com)
- [Pingdom](https://pingdom.com)
- [StatusCake](https://statuscake.com)

## Security Checklist

### Pre-Deployment
- [ ] All API keys in environment variables
- [ ] No sensitive data in code
- [ ] HTTPS enabled
- [ ] CORS configured properly
- [ ] RLS policies enabled
- [ ] Input validation on all forms
- [ ] SQL injection prevention
- [ ] XSS protection

### Post-Deployment
- [ ] Test authentication flow
- [ ] Verify RLS policies working
- [ ] Check admin routes protected
- [ ] Test banned user flow
- [ ] Verify maintenance mode
- [ ] Check error handling
- [ ] Test on multiple devices

## Database Backup

### Automated Backups

Supabase automatically backs up daily.

### Manual Backup
```bash
# Via Supabase CLI
supabase db dump -f backup.sql

# Or pg_dump directly
pg_dump $DATABASE_URL > backup.sql
```

### Restore Backup
```bash
psql $DATABASE_URL < backup.sql
```

## SSL/TLS Configuration

### Let's Encrypt (Free)

For custom hosting:
```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Cloudflare SSL

1. Add site to Cloudflare
2. Change nameservers
3. Enable "Full (strict)" SSL mode
4. Force HTTPS redirect

## Continuous Deployment

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build
      env:
        VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
        VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      run: npm run build
    
    - name: Deploy to Vercel
      uses: amondnet/vercel-action@v20
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
        vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
        vercel-args: '--prod'
```

## Rollback Strategy

### Vercel
```bash
# Rollback to previous deployment
vercel rollback
```

### Manual Rollback
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or reset to specific commit
git reset --hard <commit-hash>
git push -f origin main
```

## Post-Deployment Testing

### Smoke Tests
- [ ] Homepage loads
- [ ] Search works
- [ ] User can sign up
- [ ] User can login
- [ ] Video playback works
- [ ] Comments load
- [ ] Watchlist functions
- [ ] Admin dashboard (if admin)

### Load Testing
```bash
# Using Apache Bench
ab -n 1000 -c 100 https://yourdomain.com/

# Using Artillery
npm install -g artillery
artillery quick --count 100 --num 10 https://yourdomain.com/
```

## Troubleshooting

### Build Failures

**Problem:** Build fails on platform

Solution:
```bash
# Test build locally
npm run build

# Check for type errors
npm run type-check

# Verify dependencies
npm ci
```

### Environment Variable Issues

**Problem:** API calls fail in production

Solution:
- Verify variables set in platform dashboard
- Check variable names match exactly (`VITE_` prefix)
- Restart deployment after adding variables

### CORS Errors

**Problem:** API calls blocked by CORS

Solution:
- Configure Supabase allowed origins
- Use video-proxy edge function
- Check API endpoints support CORS

## Scaling Considerations

### Database
- Monitor query performance
- Add indexes for slow queries
- Consider read replicas
- Implement caching layer

### Frontend
- Use CDN for static assets
- Implement lazy loading
- Optimize images
- Code splitting

### Backend
- Use Supabase connection pooling
- Implement rate limiting
- Cache frequent queries
- Monitor edge function usage

## Cost Optimization

### Supabase
- Free tier: 500MB database, 1GB bandwidth
- Pro tier: $25/month for more resources
- Monitor usage in dashboard

### Hosting
- Vercel: Free for hobby projects
- Netlify: 100GB bandwidth free
- GitHub Pages: Free for public repos

## Next Steps

After deployment:
1. Set up monitoring
2. Configure backups
3. Add custom domain
4. Enable analytics
5. Test thoroughly
6. Document deployment process
7. Create runbook for common issues
