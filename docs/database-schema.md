# Database Schema

This document describes the database structure and relationships in Tatakai.

## Schema Overview

```sql
auth.users (Supabase Auth)
    ↓
profiles
    ├── watch_history
    ├── watchlist
    ├── comments
    ├── ratings
    └── admin_messages (many-to-many)

maintenance_mode (singleton)
views (anime statistics)
```

## Tables

### profiles

User profile information and settings.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  is_admin BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  theme TEXT DEFAULT 'sunset',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Columns:**
- `id`: Primary key
- `user_id`: Reference to auth.users
- `username`: Unique username
- `avatar_url`: Profile picture URL
- `bio`: User biography
- `is_admin`: Admin privilege flag
- `is_banned`: Ban status
- `theme`: Selected theme name
- `created_at`: Account creation timestamp
- `updated_at`: Last update timestamp

**Indexes:**
```sql
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_username ON profiles(username);
```

**RLS Policies:**
```sql
-- Anyone can view profiles
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can update any profile
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );
```

---

### watch_history

Tracks user's watching progress for each anime episode.

```sql
CREATE TABLE watch_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  episode_number INTEGER,
  current_time NUMERIC DEFAULT 0,
  duration NUMERIC,
  completed BOOLEAN DEFAULT false,
  last_watched TIMESTAMPTZ DEFAULT NOW(),
  anime_title TEXT,
  anime_image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, anime_id, episode_id)
);
```

**Columns:**
- `user_id`: User who watched
- `anime_id`: Anime identifier
- `episode_id`: Episode identifier
- `episode_number`: Episode number
- `current_time`: Last playback position (seconds)
- `duration`: Total episode duration
- `completed`: Whether episode was fully watched
- `last_watched`: Last watch timestamp
- `anime_title`: Cached anime title
- `anime_image`: Cached anime thumbnail

**Indexes:**
```sql
CREATE INDEX idx_watch_history_user_id ON watch_history(user_id);
CREATE INDEX idx_watch_history_anime_id ON watch_history(anime_id);
CREATE INDEX idx_watch_history_last_watched ON watch_history(last_watched DESC);
```

**RLS Policies:**
```sql
-- Users can view their own history
CREATE POLICY "Users can view own watch history"
  ON watch_history FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own history
CREATE POLICY "Users can insert own watch history"
  ON watch_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own history
CREATE POLICY "Users can update own watch history"
  ON watch_history FOR UPDATE
  USING (auth.uid() = user_id);
```

---

### watchlist

User's saved anime list.

```sql
CREATE TABLE watchlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  anime_title TEXT,
  anime_image TEXT,
  anime_type TEXT,
  status TEXT DEFAULT 'plan_to_watch',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, anime_id)
);
```

**Columns:**
- `user_id`: User who saved the anime
- `anime_id`: Anime identifier
- `anime_title`: Cached anime title
- `anime_image`: Cached anime thumbnail
- `anime_type`: Type (TV, Movie, etc.)
- `status`: Watch status (plan_to_watch, watching, completed)
- `added_at`: When added to list

**Indexes:**
```sql
CREATE INDEX idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX idx_watchlist_anime_id ON watchlist(anime_id);
```

**RLS Policies:**
```sql
-- Users can view their own watchlist
CREATE POLICY "Users can view own watchlist"
  ON watchlist FOR SELECT
  USING (auth.uid() = user_id);

-- Users can manage their own watchlist
CREATE POLICY "Users can manage own watchlist"
  ON watchlist FOR ALL
  USING (auth.uid() = user_id);
```

---

### comments

User comments on anime.

```sql
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Columns:**
- `user_id`: Comment author
- `anime_id`: Anime being commented on
- `content`: Comment text
- `created_at`: Comment creation time
- `updated_at`: Last edit time

**Indexes:**
```sql
CREATE INDEX idx_comments_anime_id ON comments(anime_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);
```

**RLS Policies:**
```sql
-- Everyone can view comments
CREATE POLICY "Comments are viewable by everyone"
  ON comments FOR SELECT
  USING (true);

-- Authenticated users can insert comments
CREATE POLICY "Authenticated users can insert comments"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can delete any comment
CREATE POLICY "Admins can delete any comment"
  ON comments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );
```

---

### ratings

User ratings for anime.

```sql
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, anime_id)
);
```

**Columns:**
- `user_id`: User who rated
- `anime_id`: Anime being rated
- `rating`: Rating value (1-10)

**Indexes:**
```sql
CREATE INDEX idx_ratings_anime_id ON ratings(anime_id);
CREATE INDEX idx_ratings_user_id ON ratings(user_id);
```

**RLS Policies:**
```sql
-- Everyone can view ratings
CREATE POLICY "Ratings are viewable by everyone"
  ON ratings FOR SELECT
  USING (true);

-- Authenticated users can insert ratings
CREATE POLICY "Authenticated users can insert ratings"
  ON ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own ratings
CREATE POLICY "Users can update own ratings"
  ON ratings FOR UPDATE
  USING (auth.uid() = user_id);
```

---

### views

Tracks anime view counts.

```sql
CREATE TABLE views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  anime_id TEXT NOT NULL,
  view_count INTEGER DEFAULT 0,
  last_viewed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(anime_id)
);
```

**Columns:**
- `anime_id`: Anime identifier
- `view_count`: Total view count
- `last_viewed`: Last view timestamp

**Indexes:**
```sql
CREATE INDEX idx_views_anime_id ON views(anime_id);
CREATE INDEX idx_views_count ON views(view_count DESC);
```

**RLS Policies:**
```sql
-- Everyone can view counts
CREATE POLICY "Views are viewable by everyone"
  ON views FOR SELECT
  USING (true);

-- Service role can manage views
CREATE POLICY "Service role can manage views"
  ON views FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
```

---

### maintenance_mode

System-wide maintenance status (singleton table).

```sql
CREATE TABLE maintenance_mode (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_enabled BOOLEAN DEFAULT false,
  message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
```

**Columns:**
- `id`: Always 1 (singleton)
- `is_enabled`: Maintenance mode active
- `message`: Maintenance message to display
- `updated_at`: Last update time
- `updated_by`: Admin who enabled

**RLS Policies:**
```sql
-- Everyone can view maintenance status
CREATE POLICY "Maintenance status is viewable by everyone"
  ON maintenance_mode FOR SELECT
  USING (true);

-- Only admins can update maintenance mode
CREATE POLICY "Only admins can update maintenance mode"
  ON maintenance_mode FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );
```

---

### admin_messages

Admin broadcast messages to users.

```sql
CREATE TABLE admin_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_admin_id UUID REFERENCES auth.users(id),
  to_user_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  is_broadcast BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Columns:**
- `from_admin_id`: Admin who sent message
- `to_user_id`: Recipient (NULL for broadcast)
- `message`: Message content
- `is_broadcast`: Whether message is for all users
- `is_read`: Read status
- `created_at`: Message timestamp

**Indexes:**
```sql
CREATE INDEX idx_admin_messages_to_user ON admin_messages(to_user_id);
CREATE INDEX idx_admin_messages_broadcast ON admin_messages(is_broadcast);
CREATE INDEX idx_admin_messages_created_at ON admin_messages(created_at DESC);
```

**RLS Policies:**
```sql
-- Users can view their own messages and broadcasts
CREATE POLICY "Users can view their messages"
  ON admin_messages FOR SELECT
  USING (
    auth.uid() = to_user_id
    OR is_broadcast = true
  );

-- Users can mark their messages as read
CREATE POLICY "Users can mark messages as read"
  ON admin_messages FOR UPDATE
  USING (auth.uid() = to_user_id);

-- Admins can send messages
CREATE POLICY "Admins can send messages"
  ON admin_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );
```

## Functions and Triggers

### Auto-create profile on signup

```sql
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

### Update timestamp trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all relevant tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## Relationships

```
auth.users (1) ─────── (1) profiles
                          │
                          ├─ (1:N) watch_history
                          ├─ (1:N) watchlist
                          ├─ (1:N) comments
                          ├─ (1:N) ratings
                          └─ (1:N) admin_messages
```

## Backup and Maintenance

### Regular Backups
Supabase provides automatic daily backups.

### Manual Backup
```bash
pg_dump $DATABASE_URL > backup.sql
```

### Vacuum and Analyze
```sql
VACUUM ANALYZE profiles;
VACUUM ANALYZE watch_history;
VACUUM ANALYZE comments;
```

## Migration Strategy

1. Always test migrations in development first
2. Create migration file in `supabase/migrations/`
3. Use timestamp prefix: `YYYYMMDDHHMMSS_description.sql`
4. Run via Supabase CLI or dashboard
5. Verify with `SELECT * FROM schema_migrations;`
