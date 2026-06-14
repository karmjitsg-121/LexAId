-- ============================================================
-- LexAid — Indian Legal Knowledge Database Schema
-- Run this in your Supabase SQL Editor (Project > SQL Editor)
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================================
-- 2. LAWS TABLE — one row per Act
-- ============================================================
CREATE TABLE IF NOT EXISTS laws (
  id          SERIAL PRIMARY KEY,
  act_name    TEXT NOT NULL,
  short_title TEXT,
  act_number  TEXT,                -- e.g. "Central Act 45 of 1860"
  year        INTEGER,
  ministry    TEXT,
  category    TEXT,                -- Criminal | Civil | Labour | Property | Family | Cyber | Tax | Constitutional | Consumer | Environmental | Commercial
  description TEXT,
  in_force    BOOLEAN DEFAULT true,
  enacted_on  DATE,
  source_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(act_name, year)
);

-- ============================================================
-- 3. CHAPTERS TABLE — one row per chapter/part per act
-- ============================================================
CREATE TABLE IF NOT EXISTS chapters (
  id             SERIAL PRIMARY KEY,
  law_id         INTEGER NOT NULL REFERENCES laws(id) ON DELETE CASCADE,
  chapter_number TEXT,             -- "I", "II", "1", etc.
  chapter_title  TEXT NOT NULL,
  sort_order     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. SECTIONS TABLE — one row per section, with embeddings
-- ============================================================
CREATE TABLE IF NOT EXISTS sections (
  id              SERIAL PRIMARY KEY,
  law_id          INTEGER NOT NULL REFERENCES laws(id) ON DELETE CASCADE,
  chapter_id      INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  section_number  TEXT NOT NULL,   -- "21", "21A", "Section 3", "Article 14"
  section_title   TEXT,
  section_content TEXT NOT NULL,
  keywords        TEXT[],
  embeddings      VECTOR(384),     -- paraphrase-multilingual-MiniLM-L12-v2
  fts             TSVECTOR,        -- full-text search
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(law_id, section_number)
);

-- ============================================================
-- 5. INDEXES
-- ============================================================

-- HNSW index for fast cosine similarity (best for RAG)
CREATE INDEX IF NOT EXISTS idx_sections_embeddings_hnsw
  ON sections USING hnsw (embeddings vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_sections_fts
  ON sections USING GIN(fts);

-- Keyword array index
CREATE INDEX IF NOT EXISTS idx_sections_keywords
  ON sections USING GIN(keywords);

-- Law category index
CREATE INDEX IF NOT EXISTS idx_laws_category ON laws(category);
CREATE INDEX IF NOT EXISTS idx_sections_law_id ON sections(law_id);
CREATE INDEX IF NOT EXISTS idx_chapters_law_id ON chapters(law_id);

-- ============================================================
-- 6. AUTO-UPDATE tsvector ON INSERT/UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION sections_fts_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.fts := to_tsvector('english',
    COALESCE(NEW.section_title, '') || ' ' ||
    COALESCE(NEW.section_content, '') || ' ' ||
    COALESCE(array_to_string(NEW.keywords, ' '), '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sections_fts_trigger ON sections;
CREATE TRIGGER sections_fts_trigger
  BEFORE INSERT OR UPDATE ON sections
  FOR EACH ROW EXECUTE FUNCTION sections_fts_update();

-- ============================================================
-- 7. ROW LEVEL SECURITY (public read, service-role write)
-- ============================================================
ALTER TABLE laws     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- Public can read all laws/chapters/sections
CREATE POLICY "public_read_laws"     ON laws     FOR SELECT USING (true);
CREATE POLICY "public_read_chapters" ON chapters FOR SELECT USING (true);
CREATE POLICY "public_read_sections" ON sections FOR SELECT USING (true);

-- Only service role can write (used by ingestion pipeline)
CREATE POLICY "service_write_laws"     ON laws     FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_chapters" ON chapters FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_sections" ON sections FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 8. PROFILES TABLE & TRIGGERS (for User registration sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  updated_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone" 
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" 
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Function to handle auto-creation of profile on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run handle_new_user after a new user registers in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

