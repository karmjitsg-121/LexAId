-- ============================================================
-- LexAid — Supabase RPC Functions for Hybrid Legal Search
-- Run this AFTER schema.sql in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. HYBRID SEARCH — vector similarity + full-text (primary)
-- ============================================================
CREATE OR REPLACE FUNCTION search_legal_sections(
  query_embedding   VECTOR(384),
  query_text        TEXT        DEFAULT '',
  match_count       INT         DEFAULT 8,
  match_threshold   FLOAT       DEFAULT 0.25,
  filter_category   TEXT        DEFAULT NULL,
  filter_law_id     INT         DEFAULT NULL
)
RETURNS TABLE (
  section_id      INT,
  law_id          INT,
  act_name        TEXT,
  category        TEXT,
  chapter_title   TEXT,
  section_number  TEXT,
  section_title   TEXT,
  section_content TEXT,
  keywords        TEXT[],
  similarity      FLOAT,
  search_rank     FLOAT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_query_tsquery TSQUERY;
BEGIN
  -- Build tsquery for full-text (gracefully handle empty query)
  BEGIN
    IF query_text <> '' THEN
      v_query_tsquery := websearch_to_tsquery('english', query_text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_query_tsquery := NULL;
  END;

  RETURN QUERY
  WITH vector_results AS (
    SELECT
      s.id,
      s.law_id,
      l.act_name,
      l.category,
      c.chapter_title,
      s.section_number,
      s.section_title,
      s.section_content,
      s.keywords,
      -- cosine similarity (1 = identical, 0 = orthogonal)
      (1 - (s.embeddings <=> query_embedding))::FLOAT AS similarity,
      -- full-text rank (0 if no query)
      CASE
        WHEN v_query_tsquery IS NOT NULL THEN
          ts_rank(s.fts, v_query_tsquery)::FLOAT
        ELSE 0.0
      END AS fts_rank
    FROM sections s
    JOIN laws l ON l.id = s.law_id
    LEFT JOIN chapters c ON c.id = s.chapter_id
    WHERE
      -- Apply category filter
      (filter_category IS NULL OR l.category = filter_category)
      -- Apply law filter
      AND (filter_law_id IS NULL OR s.law_id = filter_law_id)
      -- Only return above threshold
      AND (1 - (s.embeddings <=> query_embedding)) > match_threshold
  )
  SELECT
    vr.id,
    vr.law_id,
    vr.act_name,
    vr.category,
    vr.chapter_title,
    vr.section_number,
    vr.section_title,
    vr.section_content,
    vr.keywords,
    vr.similarity,
    -- Combined score: 70% semantic + 30% keyword
    (0.7 * vr.similarity + 0.3 * vr.fts_rank) AS search_rank
  FROM vector_results vr
  ORDER BY search_rank DESC
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 2. KEYWORD-ONLY SEARCH (fallback when no embedding)
-- ============================================================
CREATE OR REPLACE FUNCTION search_legal_keyword(
  query_text      TEXT,
  match_count     INT  DEFAULT 8,
  filter_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  section_id      INT,
  law_id          INT,
  act_name        TEXT,
  category        TEXT,
  chapter_title   TEXT,
  section_number  TEXT,
  section_title   TEXT,
  section_content TEXT,
  keywords        TEXT[],
  search_rank     FLOAT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_query_tsquery TSQUERY;
BEGIN
  v_query_tsquery := websearch_to_tsquery('english', query_text);

  RETURN QUERY
  SELECT
    s.id,
    s.law_id,
    l.act_name,
    l.category,
    c.chapter_title,
    s.section_number,
    s.section_title,
    s.section_content,
    s.keywords,
    ts_rank(s.fts, v_query_tsquery)::FLOAT AS search_rank
  FROM sections s
  JOIN laws l ON l.id = s.law_id
  LEFT JOIN chapters c ON c.id = s.chapter_id
  WHERE
    s.fts @@ v_query_tsquery
    AND (filter_category IS NULL OR l.category = filter_category)
  ORDER BY search_rank DESC
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 3. GET ACT OVERVIEW — all sections of a specific act
-- ============================================================
CREATE OR REPLACE FUNCTION get_act_sections(p_act_name TEXT)
RETURNS TABLE (
  section_id      INT,
  chapter_title   TEXT,
  section_number  TEXT,
  section_title   TEXT,
  section_content TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT
    s.id,
    c.chapter_title,
    s.section_number,
    s.section_title,
    s.section_content
  FROM sections s
  JOIN laws l ON l.id = s.law_id
  LEFT JOIN chapters c ON c.id = s.chapter_id
  WHERE l.act_name ILIKE '%' || p_act_name || '%'
  ORDER BY c.sort_order, s.section_number;
$$;

-- ============================================================
-- 4. DATABASE STATISTICS
-- ============================================================
CREATE OR REPLACE FUNCTION get_db_stats()
RETURNS TABLE (
  total_laws     BIGINT,
  total_chapters BIGINT,
  total_sections BIGINT,
  sections_with_embeddings BIGINT,
  categories     TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT COUNT(*) FROM laws)     AS total_laws,
    (SELECT COUNT(*) FROM chapters) AS total_chapters,
    (SELECT COUNT(*) FROM sections) AS total_sections,
    (SELECT COUNT(*) FROM sections WHERE embeddings IS NOT NULL) AS sections_with_embeddings,
    (SELECT STRING_AGG(DISTINCT category, ', ' ORDER BY category) FROM laws) AS categories;
$$;

-- ============================================================
-- 5. SECURE EMAIL REGISTRATION CHECK
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE email = p_email
  );
END;
$$ LANGUAGE plpgsql;

