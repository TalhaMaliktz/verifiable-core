import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger, BadRequestException } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmbeddingFactory } from 'src/embedding/embedding.factory';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as fs from 'fs/promises';

interface IngestionJobData {
    storagePath: string;
    documentId: string;
    preferredModel?: string;
}

@Processor('ingestion')
export class IngestionProcessor extends WorkerHost {
    private readonly logger = new Logger(IngestionProcessor.name);
    private readonly textSplitter: RecursiveCharacterTextSplitter;

    constructor(
        private readonly ingestionService: IngestionService,
        private readonly prisma: PrismaService,
        private readonly embeddingFactory: EmbeddingFactory,
    ) {
        super();

        // Chunking parameters remain consistent across all models
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
    }

    async process(job: Job<IngestionJobData>): Promise<any> {
        this.logger.log(`--- [WORKER START] Job ${job.id} (Attempt ${job.attemptsMade + 1}) ---`);
        const { storagePath, documentId, preferredModel } = job.data;

        try {
            // 1. Resolve embedding provider dynamically via Factory
            const provider = this.embeddingFactory.getProvider(preferredModel);
            this.logger.log(`Active Embedding Provider: ${provider.modelName} (${provider.dimensions} dims)`);

            // 2. Track model metadata on the document record
            await this.prisma.document.update({
                where: { id: documentId },
                data: {
                    status: 'PROCESSING',
                    embeddingModel: provider.modelName,
                    dimensions: provider.dimensions,
                },
            });

            // 3. Extract text from disk and chunk it
            const extractedText = await this.ingestionService.extractText(storagePath);
            this.logger.log(`Extracted Text from Doc ${documentId}: ${extractedText.substring(0, 50)}...`);

            const rawDocs = await this.textSplitter.createDocuments([extractedText]);
            const docs = rawDocs.filter((doc) => doc.pageContent.trim().length > 0);
            this.logger.log(`Split document into ${docs.length} valid chunks.`);

            // 4. Delegate embedding generation to the active provider
            let savedCount = 0;
            for (let i = 0; i < docs.length; i++) {
                try {
                    const result = await provider.embedText(docs[i].pageContent);

                    if (result.embedding && result.embedding.length > 0) {
                        await this.prisma.$executeRaw`
                        INSERT INTO "DocumentChunk" (id, text, "documentId", embedding)
                        VALUES (
                            gen_random_uuid(), 
                            ${docs[i].pageContent}, 
                            ${documentId}, 
                            ${JSON.stringify(result.embedding)}::vector
                        )
                        `;
                        savedCount++;
                        this.logger.log(`[${i + 1}/${docs.length}] Persisted ${result.dimensions}-dim vector.`);
                    }
                } catch (err) {
                    this.logger.error(`Embedding generation failed on chunk ${i}:`, err);
                    throw err; // Trigger BullMQ retry for transient network errors
                }
            }

            this.logger.log(`Successfully saved ${savedCount} vectors to pgvector.`);

            // 5. Complete document processing
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
                modelUsed: provider.modelName,
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
            // Only delete file if job succeeded OR if this was the final retry attempt
            const maxAttempts = job.opts.attempts ?? 3;
            const isFinalAttempt = (job.attemptsMade + 1) >= maxAttempts;

            // If completed successfully or permanently failed, wipe from disk
            if (isFinalAttempt || (await this.prisma.document.findUnique({ where: { id: documentId } }))?.status === 'COMPLETED') {
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
}