-- Create an expression-based GIN index on DocumentChunk text for full-text search
CREATE INDEX IF NOT EXISTS "DocumentChunk_text_fts_idx"
ON "DocumentChunk"
USING gin (to_tsvector('english', text));