-- Alter the vector column to accept Gemini's 768 dimensions
ALTER TABLE "DocumentChunk" ALTER COLUMN "embedding" TYPE vector(768);