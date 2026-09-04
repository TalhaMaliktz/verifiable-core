import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
    InternalServerErrorException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingFactory } from '../embedding/embedding.factory';
import { ChatFactory } from './chat.factory';
import { Prisma } from '@prisma/client';
import { CandidateChunk, FusedChunk } from './interfaces/search-chunks.interface';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly embeddingFactory: EmbeddingFactory,
        private readonly chatFactory: ChatFactory,
    ) { }

    async processChatRequest(userMessage: string, documentIds?: string[]) {
        const targetDocIds = documentIds && documentIds.length > 0
            ? Array.from(new Set(documentIds))
            : undefined;

        this.logger.log(
            `Received query: "${userMessage}" | Scoped Docs: ${targetDocIds && targetDocIds.length > 0 ? targetDocIds.join(', ') : 'Global Knowledge Base'
            }`,
        );

        try {
            // 1. Model Resolution and Dimension Uniformity Verification
            let targetModel: string | undefined;

            if (targetDocIds && targetDocIds.length > 0) {
                const documents = await this.prisma.document.findMany({
                    where: { id: { in: targetDocIds } },
                    select: { id: true, title: true, embeddingModel: true, dimensions: true, status: true },
                });

                if (documents.length === 0) {
                    throw new NotFoundException('None of the specified document IDs were found.');
                }

                if (documents.length !== targetDocIds.length) {
                    const foundIds = new Set(documents.map((d) => d.id));
                    const missingIds = targetDocIds.filter((id) => !foundIds.has(id));
                    throw new NotFoundException(`Documents not found for IDs: ${missingIds.join(', ')}`);
                }

                // Verify that all selected documents share identical embedding models
                const modelSet = new Set(documents.map((d) => d.embeddingModel));
                if (modelSet.size > 1) {
                    throw new BadRequestException(
                        `Cannot query across mixed embedding models simultaneously: [${Array.from(modelSet).join(
                            ', ',
                        )}]. Please select documents embedded with the same model.`,
                    );
                }

                targetModel = documents[0].embeddingModel ?? undefined;
            }

            // 2. Vectorize user query via active embedding provider
            const provider = this.embeddingFactory.getProvider(targetModel);
            this.logger.log(
                `Vectorizing query using provider: ${provider.modelName} (${provider.dimensions} dims)`,
            );

            const { embedding } = await provider.embedText(userMessage);
            const vectorString = JSON.stringify(embedding);

            // 3. Scatter-Gather Hybrid Retrieval (Dense Vector + Sparse Keyword in Parallel)
            const CANDIDATE_LIMIT = 20;
            const TOP_K_FINAL = 5;
            const RRF_K = 60;

            const [denseCandidates, sparseCandidates] = await Promise.all([
                this.executeDenseSearch(
                    vectorString,
                    provider.dimensions,
                    CANDIDATE_LIMIT,
                    targetDocIds,
                ),
                this.executeSparseSearch(
                    userMessage,
                    CANDIDATE_LIMIT,
                    targetDocIds,
                ),
            ]);

            this.logger.log(
                `Retrieved candidates -> Dense: ${denseCandidates.length} | Sparse: ${sparseCandidates.length}`,
            );

            // 4. In-Memory Reciprocal Rank Fusion
            const fusedResults = this.fuseWithRRF(denseCandidates, sparseCandidates, RRF_K);
            const topChunks = fusedResults.slice(0, TOP_K_FINAL);

            this.logger.log(`Fused top candidates selected: ${topChunks.length}`);

            if (topChunks.length === 0) {
                return {
                    query: userMessage,
                    answer: 'I do not have enough information in the selected documents to answer this question.',
                    sourcesUsed: 0,
                    citations: [],
                };
            }

            // 5. Verifiable Context Formatting with Document Titles and Chunk Indexes
            const formattedContext = topChunks
                .map(
                    (chunk) =>
                        `[DOCUMENT: "${chunk.documentTitle}" | Chunk: ${chunk.chunkIndex}]\n${chunk.text}`,
                )
                .join('\n\n---\n\n');

            const systemPrompt = `You are an expert enterprise technical assistant.
                Answer the user's question using ONLY the provided context.
                For every factual statement, cite the exact source document using the format: [Document: "filename.ext", Chunk: X].
                If multiple documents contain relevant information, synthesize the insights and cite all applicable sources.
                If the context does not contain enough information, clearly state that you do not know.`;

            const userPrompt = `CONTEXT:\n${formattedContext}\n\nUSER QUESTION:\n${userMessage}`;

            this.logger.log('Delegating text generation to active chat provider...');
            const chatProvider = this.chatFactory.getProvider();
            const finalAnswer = await chatProvider.generateAnswer(systemPrompt, userPrompt);

            return {
                query: userMessage,
                answer: finalAnswer,
                sourcesUsed: topChunks.length,
                citations: topChunks.map((r) => ({
                    documentId: r.documentId,
                    documentTitle: r.documentTitle,
                    chunkIndex: r.chunkIndex,
                    rrfScore: parseFloat(r.rrfScore.toFixed(6)),
                })),
            };
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`Chat retrieval failure: ${(error as Error).message}`, (error as Error).stack);
            throw new InternalServerErrorException('Failed to process AI Retrieval layer.');
        }
    }

    /**
     * Executes dense vector search utilizing PostgreSQL Partial HNSW Indexes.
     */
    private async executeDenseSearch(
        vectorString: string,
        dimensions: number,
        limit: number,
        documentIds?: string[],
    ): Promise<CandidateChunk[]> {
        const hasDocScope = documentIds && documentIds.length > 0;

        return this.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe('SET LOCAL hnsw.ef_search = 100;');

            if (dimensions === 768) {
                return tx.$queryRaw<CandidateChunk[]>`
                    SELECT 
                        c.id,
                        c."documentId",
                        d.title AS "documentTitle",
                        c."chunkIndex",
                        c.text
                    FROM "DocumentChunk" c
                    JOIN "Document" d ON c."documentId" = d.id
                    WHERE vector_dims(c.embedding) = 768
                        AND d.status = 'COMPLETED'
                        ${hasDocScope ? Prisma.sql`AND c."documentId" = ANY(${documentIds}::text[])` : Prisma.empty}
                    ORDER BY (c.embedding::vector(768)) <=> ${vectorString}::vector(768) ASC
                    LIMIT ${limit};
                `;
            }

            return tx.$queryRaw<CandidateChunk[]>`
                SELECT 
                    c.id,
                    c."documentId",
                    d.title AS "documentTitle",
                    c."chunkIndex",
                    c.text
                FROM "DocumentChunk" c
                JOIN "Document" d ON c."documentId" = d.id
                WHERE vector_dims(c.embedding) = 1536
                    AND d.status = 'COMPLETED'
                    ${hasDocScope ? Prisma.sql`AND c."documentId" = ANY(${documentIds}::text[])` : Prisma.empty}
                ORDER BY (c.embedding::vector(1536)) <=> ${vectorString}::vector(1536) ASC
                LIMIT ${limit};
            `;
        });
    }

    /**
     * Executes sparse keyword search utilizing PostgreSQL GIN index and ts_rank.
     */
    private async executeSparseSearch(
        userMessage: string,
        limit: number,
        documentIds?: string[],
    ): Promise<CandidateChunk[]> {
        const hasDocScope = documentIds && documentIds.length > 0;

        return this.prisma.$queryRaw<CandidateChunk[]>`
            SELECT 
                c.id,
                c."documentId",
                d.title AS "documentTitle",
                c."chunkIndex",
                c.text
            FROM "DocumentChunk" c
            JOIN "Document" d ON c."documentId" = d.id
            WHERE d.status = 'COMPLETED'
                ${hasDocScope ? Prisma.sql`AND c."documentId" = ANY(${documentIds}::text[])` : Prisma.empty}
                AND to_tsvector('english', c.text) @@ plainto_tsquery('english', ${userMessage})
            ORDER BY ts_rank(to_tsvector('english', c.text), plainto_tsquery('english', ${userMessage})) DESC
            LIMIT ${limit};
        `;
    }

    /**
     * Blends disparate dense and sparse search rankings using Reciprocal Rank Fusion (RRF).
     */
    private fuseWithRRF(
        denseResults: CandidateChunk[],
        sparseResults: CandidateChunk[],
        k: number = 60,
    ): FusedChunk[] {
        const fusedMap = new Map<string, FusedChunk>();

        // 1. Ingest dense results (1-based rank: index + 1)
        denseResults.forEach((chunk, index) => {
            const rank = index + 1;
            fusedMap.set(chunk.id, {
                ...chunk,
                rrfScore: 1 / (k + rank),
            });
        });

        // 2. Ingest sparse results and accumulate scores
        sparseResults.forEach((chunk, index) => {
            const rank = index + 1;
            const existing = fusedMap.get(chunk.id);

            if (existing) {
                existing.rrfScore += 1 / (k + rank);
            } else {
                fusedMap.set(chunk.id, {
                    ...chunk,
                    rrfScore: 1 / (k + rank),
                });
            }
        });

        // 3. Sort descending by combined RRF score
        return Array.from(fusedMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);
    }
}