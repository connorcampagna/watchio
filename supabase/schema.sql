-- ============================================================
-- Watchio  –  Supabase Schema (PostgreSQL)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────────
-- 1. USERS
-- ──────────────────────────────────────────────
CREATE TABLE public.users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Watchio Guest',
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can read any profile, but only update their own
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read profiles"
  ON public.users FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- ──────────────────────────────────────────────
-- 2. ROOMS
-- ──────────────────────────────────────────────
CREATE TABLE public.rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Friday Night Double Feature',
  invite_code     TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  video_url       TEXT,
  video_timestamp FLOAT NOT NULL DEFAULT 0,
  is_playing      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: anyone can read rooms, only host can update
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read rooms"
  ON public.rooms FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create rooms"
  ON public.rooms FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can update room"
  ON public.rooms FOR UPDATE
  USING (auth.uid() = host_id);

CREATE POLICY "Host can delete room"
  ON public.rooms FOR DELETE
  USING (auth.uid() = host_id);

-- ──────────────────────────────────────────────
-- 3. PARTICIPANTS
-- ──────────────────────────────────────────────
CREATE TABLE public.participants (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id   UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (room_id, user_id)
);

-- RLS: participants can read their own room memberships
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read participants"
  ON public.participants FOR SELECT
  USING (true);

CREATE POLICY "Users can join rooms"
  ON public.participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms"
  ON public.participants FOR DELETE
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────
-- INDEXES for performance
-- ──────────────────────────────────────────────
CREATE INDEX idx_rooms_invite_code ON public.rooms(invite_code);
CREATE INDEX idx_rooms_host_id     ON public.rooms(host_id);
CREATE INDEX idx_participants_room ON public.participants(room_id);
CREATE INDEX idx_participants_user ON public.participants(user_id);
