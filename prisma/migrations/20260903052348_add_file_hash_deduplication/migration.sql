/*
  Warnings:

  - A unique constraint covering the columns `[fileHash]` on the table `Document` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fileHash` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "fileHash" TEXT NOT NULL,
ALTER COLUMN "dimensions" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_fileHash_key" ON "Document"("fileHash");
