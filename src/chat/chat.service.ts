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

interface RetrievedChunk {
    id: string;
    documentId: string;
    documentTitle: string;
    chunkIndex: number;
    text: string;
    similarity: number;
}

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
            // 1. Model Resolution & Dimension Uniformity Verification
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

                targetModel = documents[0].embeddingModel;
            }

            // 2. Vectorize user question using the resolved provider
            const provider = this.embeddingFactory.getProvider(targetModel);
            this.logger.log(
                `Vectorizing query using provider: ${provider.modelName} (${provider.dimensions} dims)`,
            );

            const { embedding } = await provider.embedText(userMessage);
            const vectorString = JSON.stringify(embedding);

            // 3. Sub-Millisecond Indexed Vector Search via Partial HNSW
            const SIMILARITY_THRESHOLD = 0.35;
            const TOP_K_LIMIT = 5;

            const searchResults = await this.executeIndexedSearch(
                vectorString,
                provider.dimensions,
                SIMILARITY_THRESHOLD,
                TOP_K_LIMIT,
                targetDocIds,
            );

            this.logger.log(`Retrieved ${searchResults.length} matching candidate chunks.`);

            if (searchResults.length === 0) {
                return {
                    query: userMessage,
                    answer: 'I do not have enough information in the selected documents to answer this question.',
                    sourcesUsed: 0,
                    citations: [],
                };
            }

            // 4. Verifiable Context Formatting with Document Titles & Chunk Indexes
            const formattedContext = searchResults
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
                sourcesUsed: searchResults.length,
                citations: searchResults.map((r) => ({
                    documentId: r.documentId,
                    documentTitle: r.documentTitle,
                    chunkIndex: r.chunkIndex,
                    similarity: parseFloat(r.similarity.toFixed(4)),
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
     * Executes parameterized SQL utilizing PostgreSQL Partial HNSW Index Partitions.
     */
    private async executeIndexedSearch(
        vectorString: string,
        dimensions: number,
        threshold: number,
        limit: number,
        documentIds?: string[],
    ): Promise<RetrievedChunk[]> {
        const hasDocScope = documentIds && documentIds.length > 0;

        if (dimensions === 768) {
            return this.prisma.$queryRaw<RetrievedChunk[]>`
            SELECT 
            c.id,
            c."documentId",
            d.title AS "documentTitle",
            c."chunkIndex",
            c.text,
            (1 - ((c.embedding::vector(768)) <=> ${vectorString}::vector(768)))::float AS similarity
            FROM "DocumentChunk" c
            JOIN "Document" d ON c."documentId" = d.id
            WHERE vector_dims(c.embedding) = 768
            AND d.status = 'COMPLETED'
            ${hasDocScope ? Prisma.sql`AND c."documentId" = ANY(${documentIds}::uuid[])` : Prisma.empty}
            AND (1 - ((c.embedding::vector(768)) <=> ${vectorString}::vector(768))) > ${threshold}
            ORDER BY (c.embedding::vector(768)) <=> ${vectorString}::vector(768) ASC
            LIMIT ${limit};
        `;
        }

        // Default: 1536 dimension partition (Gemini MRL / OpenAI / OpenRouter)
        return this.prisma.$queryRaw<RetrievedChunk[]>`
        SELECT 
            c.id,
            c."documentId",
            d.title AS "documentTitle",
            c."chunkIndex",
            c.text,
            (1 - ((c.embedding::vector(1536)) <=> ${vectorString}::vector(1536)))::float AS similarity
        FROM "DocumentChunk" c
        JOIN "Document" d ON c."documentId" = d.id
        WHERE vector_dims(c.embedding) = 1536
            AND d.status = 'COMPLETED'
            ${hasDocScope ? Prisma.sql`AND c."documentId" = ANY(${documentIds}::uuid[])` : Prisma.empty}
            AND (1 - ((c.embedding::vector(1536)) <=> ${vectorString}::vector(1536))) > ${threshold}
        ORDER BY (c.embedding::vector(1536)) <=> ${vectorString}::vector(1536) ASC
        LIMIT ${limit};
        `;
    }
}