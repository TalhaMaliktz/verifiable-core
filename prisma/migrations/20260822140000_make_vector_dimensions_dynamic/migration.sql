-- AlterTable: Strip static 3072 dimension constraint to allow dynamic vector lengths
ALTER TABLE "DocumentChunk" ALTER COLUMN "embedding" TYPE vector;