-- Migration: add openreview_id column to papers table
-- Run: sqlite3 data/papers.db < src/db/migrations/003_add_openreview_id.sql

ALTER TABLE papers ADD COLUMN openreview_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_papers_openreview_id ON papers(openreview_id) WHERE openreview_id IS NOT NULL;