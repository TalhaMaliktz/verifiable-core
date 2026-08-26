-- Enable pgvector extension if not already present
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Partial HNSW Index for 768-dimension vectors (Ollama: nomic-embed-text)
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_768_idx"
ON "DocumentChunk"
USING hnsw (((embedding)::vector(768)) vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE (vector_dims(embedding) = 768);

-- 2. Partial HNSW Index for 1536-dimension vectors (OpenAI / OpenRouter / Gemini MRL)
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_1536_idx"
ON "DocumentChunk"
USING hnsw (((embedding)::vector(1536)) vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE (vector_dims(embedding) = 1536);