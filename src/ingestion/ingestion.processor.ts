import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IngestionService } from './ingestion.service';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs/promises';

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

interface IngestionJobData {
    storagePath: string;
    documentId: string;
}

@Processor('ingestion')
export class IngestionProcessor extends WorkerHost {
    private readonly logger = new Logger(IngestionProcessor.name);
    private readonly textSplitter: RecursiveCharacterTextSplitter;
    private readonly ai: GoogleGenerativeAI;
    private readonly embeddingModel: GenerativeModel;

    constructor(
        private readonly ingestionService: IngestionService,
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
    ) {
        super();

        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not defined in environment variables. Worker cannot start.');
        }

        this.ai = new GoogleGenerativeAI(apiKey);
        this.embeddingModel = this.ai.getGenerativeModel({ model: 'gemini-embedding-001' });

        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
    }

    async process(job: Job<IngestionJobData>): Promise<any> {
        this.logger.log(`--- [WORKER START] Job ${job.id} (Attempt ${job.attemptsMade + 1}) ---`);
        const { storagePath, documentId } = job.data;

        try {
            await this.prisma.document.update({
                where: { id: documentId },
                data: { status: 'PROCESSING' },
            });

            // Extract text with format routing and null-byte sanitization
            const extractedText = await this.ingestionService.extractText(storagePath);
            this.logger.log(`Extracted Text from Doc ${documentId}: ${extractedText.substring(0, 50)}...`);

            this.logger.log(`Starting Phase 5: Chunking and Native Vectorization...`);
            const rawDocs = await this.textSplitter.createDocuments([extractedText]);
            const docs = rawDocs.filter(doc => doc.pageContent.trim().length > 0);
            this.logger.log(`Split document into ${docs.length} valid chunks.`);

            this.logger.log(`Throttling requests to Gemini (1 chunk every 4.2 seconds)...`);

            let savedCount = 0;
            for (let i = 0; i < docs.length; i++) {
                try {
                    const result = await this.embeddingModel.embedContent(docs[i].pageContent);
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
                    // Bubble up API rejections to trigger BullMQ exponential retry for transient errors
                    throw err;
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
                    content: extractedText,
                },
            });

            this.logger.log(`--- [WORKER COMPLETED] Document safely stored! ---`);

            return {
                status: 'success',
                chunksGenerated: docs.length,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            this.logger.error(`[WORKER FAILED] Job ${job.id} failed: ${errorMessage}`);

            await this.prisma.document.update({
                where: { id: documentId },
                data: {
                    status: 'FAILED',
                    errorMessage: errorMessage,
                },
            });

            if (error instanceof BadRequestException) {
                throw new UnrecoverableError(errorMessage);
            }

            throw error;
        } finally {
            try {
                await fs.unlink(storagePath);
                this.logger.log(`Ephemeral file unlinked: ${storagePath}`);
            } catch (unlinkErr: unknown) {
                const err = unlinkErr as NodeJS.ErrnoException;
                if (err.code !== 'ENOENT') {
                    this.logger.warn(`Could not unlink ephemeral file at ${storagePath}:`, unlinkErr);
                }
            }
        }
    }
}