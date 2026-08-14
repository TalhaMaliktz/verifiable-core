import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs/promises';

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface IngestionJobData {
    storagePath: string;
    documentId: string;
}

@Processor('ingestion')
export class IngestionProcessor extends WorkerHost {
    private readonly logger = new Logger(IngestionProcessor.name);

    constructor(
        private readonly ingestionService: IngestionService,
        private readonly prisma: PrismaService
    ) {
        super();
    }

    async process(job: Job<IngestionJobData>): Promise<any> {
        this.logger.log(`--- [WORKER START] Job ${job.id} ---`);

        const { storagePath, documentId } = job.data;

        try {
            await this.prisma.document.update({
                where: { id: documentId },
                data: { status: 'PROCESSING' },
            });

            // Extract text directly from disk storage path
            const extractedText = await this.ingestionService.extractTextFromPdf(storagePath);
            this.logger.log(`Extracted Text from Doc ${documentId}: ${extractedText.substring(0, 50)}...`);

            // ==========================================
            // PHASE 5: CHUNKING & VECTORIZATION (RAG INGESTION)
            // ==========================================
            this.logger.log(`Starting Phase 5: Chunking and Native Vectorization...`);

            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1000,
                chunkOverlap: 200,
            });

            const rawDocs = await splitter.createDocuments([extractedText]);
            const docs = rawDocs.filter(doc => doc.pageContent.trim().length > 0);
            this.logger.log(`Split document into ${docs.length} valid chunks.`);

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error("GEMINI_API_KEY is not defined in the environment. Worker cannot proceed.");
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

            this.logger.log(`Throttling requests to Gemini (1 chunk every 4.2 seconds)...`);

            let savedCount = 0;
            for (let i = 0; i < docs.length; i++) {
                try {
                    const result = await embeddingModel.embedContent(docs[i].pageContent);
                    const vector = result.embedding.values;

                    if (vector && vector.length > 0) {
                        await this.prisma.$executeRaw`
                            INSERT INTO "DocumentChunk" (id, text, "documentId", embedding)
                            VALUES (
                                gen_random_uuid(), 
                                ${docs[i].pageContent}, 
                                ${documentId}, 
                                ${JSON.stringify(vector)}::vector
                            )
                        `;
                        savedCount++;
                        this.logger.log(`[${i + 1}/${docs.length}] Successfully saved 3072-dim vector.`);
                    }

                } catch (err) {
                    this.logger.error(`[ERROR] Gemini API rejected chunk ${i}:`, err);
                } finally {
                    if (i < docs.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 4200));
                    }
                }
            }

            this.logger.log(`Successfully saved ${savedCount} valid vectors to pgvector.`);

            await this.prisma.document.update({
                where: { id: documentId },
                data: {
                    status: 'COMPLETED',
                    content: extractedText
                },
            });

            this.logger.log(`--- [WORKER COMPLETED] Document safely stored! ---`);

            return {
                status: 'success',
                chunksGenerated: docs.length
            };

        } catch (error) {
            const stackTrace = error instanceof Error ? error.stack : 'No stack trace available';
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

            this.logger.error(`[WORKER FAILED] Job ${job.id} failed`, stackTrace);

            await this.prisma.document.update({
                where: { id: documentId },
                data: {
                    status: 'FAILED',
                    errorMessage: errorMessage
                },
            });

            throw error;
        } finally {
            // DETERMINISTIC CLEANUP: Purge temp file from disk regardless of success or failure
            try {
                await fs.unlink(storagePath);
                this.logger.log(`Ephemeral file unlinked: ${storagePath}`);
            } catch (unlinkErr) {
                this.logger.warn(`Could not unlink ephemeral file at ${storagePath}:`, unlinkErr);
            }
        }
    }
}