-- Watch Room Enhancements: Start Timer and Ready Status

-- Add scheduled_start_at to watch_rooms
ALTER TABLE watch_rooms ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;

-- Add is_ready to watch_room_participants
ALTER TABLE watch_room_participants ADD COLUMN IF NOT EXISTS is_ready BOOLEAN DEFAULT false;
