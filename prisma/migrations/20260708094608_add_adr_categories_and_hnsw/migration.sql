-- CreateEnum
CREATE TYPE "ADRCategory" AS ENUM ('SECURITY', 'ARCHITECTURE', 'PERFORMANCE', 'COMPLIANCE');

-- AlterTable
ALTER TABLE "adr_vectors" ADD COLUMN     "rule_category" "ADRCategory" NOT NULL DEFAULT 'SECURITY';

-- Create the B-Tree index for fast category filtering
CREATE INDEX idx_adr_category ON adr_vectors(rule_category);

-- Create the HNSW index for lightning-fast vector similarity
CREATE INDEX idx_adr_embedding_hnsw ON adr_vectors USING hnsw (embedding vector_cosine_ops);