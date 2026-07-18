-- CreateTable
CREATE TABLE "adr_vectors" (
    "id" TEXT NOT NULL,
    "rule_text" TEXT NOT NULL,
    "good_code_example" TEXT,
    "embedding" vector(1024) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adr_vectors_pkey" PRIMARY KEY ("id")
);

-- Create the HNSW index for vector similarity search
CREATE INDEX "adr_vectors_embedding_idx" ON "adr_vectors" USING hnsw ("embedding" vector_cosine_ops);