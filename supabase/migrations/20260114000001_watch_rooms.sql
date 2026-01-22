-- Watch2Together (Issho ni) Feature
-- Watch party rooms with synchronized playback and chat

-- Watch rooms table
CREATE TABLE IF NOT EXISTS watch_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  anime_id TEXT,
  anime_title TEXT,
  anime_poster TEXT,
  episode_id TEXT,
  episode_number INT,
  episode_title TEXT,
  category TEXT DEFAULT 'sub' CHECK (category IN ('sub', 'dub')),
  access_type TEXT CHECK (access_type IN ('public', 'invite', 'password')) DEFAULT 'public',
  password_hash TEXT, -- null = no password, bcrypt hashed for 'password' type
  scheduled_start_at TIMESTAMPTZ, -- For countdown start
  current_time_seconds FLOAT DEFAULT 0,
  is_playing BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  max_participants INT DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);

-- Room participants
CREATE TABLE IF NOT EXISTS watch_room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES watch_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  is_host BOOLEAN DEFAULT false,
  is_ready BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Room chat messages
CREATE TABLE IF NOT EXISTS watch_room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES watch_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'chat' CHECK (message_type IN ('chat', 'system', 'reaction')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Room invites for invite-only rooms
CREATE TABLE IF NOT EXISTS watch_room_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES watch_rooms(id) ON DELETE CASCADE NOT NULL,
  invited_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '1 hour')
);

-- Enable RLS
ALTER TABLE watch_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_room_invites ENABLE ROW LEVEL SECURITY;

-- Policies for watch_rooms
CREATE POLICY "Anyone can view active rooms" ON watch_rooms
  FOR SELECT USING (is_active = true);

CREATE POLICY "Participants can view their rooms" ON watch_rooms
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM watch_room_participants WHERE room_id = id)
  );

CREATE POLICY "Host can view their rooms" ON watch_rooms
  FOR SELECT USING (host_id = auth.uid());

CREATE POLICY "Authenticated users can create rooms" ON watch_rooms
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can update their rooms" ON watch_rooms
  FOR UPDATE USING (host_id = auth.uid());

CREATE POLICY "Host can delete their rooms" ON watch_rooms
  FOR DELETE USING (host_id = auth.uid());

-- Policies for participants
CREATE POLICY "Anyone can view room participants" ON watch_room_participants
  FOR SELECT USING (true);

CREATE POLICY "Users can join rooms" ON watch_room_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participation" ON watch_room_participants
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms" ON watch_room_participants
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for messages
CREATE POLICY "Participants can view room messages" ON watch_room_messages
  FOR SELECT USING (
    room_id IN (SELECT room_id FROM watch_room_participants WHERE user_id = auth.uid())
    OR room_id IN (SELECT id FROM watch_rooms WHERE access_type = 'public')
  );

CREATE POLICY "Authenticated users can send messages" ON watch_room_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for invites
CREATE POLICY "Host can manage invites" ON watch_room_invites
  FOR ALL USING (
    room_id IN (SELECT id FROM watch_rooms WHERE host_id = auth.uid())
  );

CREATE POLICY "Invited users can view their invites" ON watch_room_invites
  FOR SELECT USING (invited_user_id = auth.uid());

-- Enable realtime for sync
ALTER PUBLICATION supabase_realtime ADD TABLE watch_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE watch_room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE watch_room_messages;

-- Function to update room timestamp
CREATE OR REPLACE FUNCTION update_watch_room_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER watch_room_updated
  BEFORE UPDATE ON watch_rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_watch_room_timestamp();

-- Function to cleanup expired rooms
CREATE OR REPLACE FUNCTION cleanup_expired_watch_rooms()
RETURNS void AS $$
BEGIN
  UPDATE watch_rooms SET is_active = false WHERE expires_at < now() AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_watch_rooms_active ON watch_rooms(is_active, access_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_watch_room_participants_room ON watch_room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_watch_room_messages_room ON watch_room_messages(room_id, created_at DESC);
