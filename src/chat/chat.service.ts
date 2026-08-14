import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private ai: GoogleGenerativeAI;

    // Added PrismaService to the constructor
    constructor(
        private configService: ConfigService,
        private prisma: PrismaService
    ) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is missing from environment variables.');
        }
        this.ai = new GoogleGenerativeAI(apiKey);
    }

    async processChatRequest(userMessage: string) {
        this.logger.log(`Received user question: "${userMessage}"`);

        try {
            // 1. Convert userMessage into a 3072-dim vector (Gemini Embedding)
            this.logger.log('Translating question into high-dimensional vector...');

            // We must strictly use the same model used during document ingestion
            const embeddingModel = this.ai.getGenerativeModel({ model: 'gemini-embedding-001' });

            const result = await embeddingModel.embedContent(userMessage);
            const queryVector = result.embedding.values;

            this.logger.log(`Successfully generated vector array of length: ${queryVector.length}`);

            // 2. Run Raw SQL Cosine Similarity search against pgvector
            this.logger.log('Querying pgvector database for top matching chunks...');

            // We must stringify the array so Postgres can parse it into the ::vector type
            const vectorString = JSON.stringify(queryVector);

            // The <=> operator calculates Cosine Distance. 
            // 1 - distance = Cosine Similarity.
            // Enterprise Pattern: Extract "Magic Numbers" into tunable configuration variables
            const SIMILARITY_THRESHOLD = 0.5; // Minimum match percentage (50%) to prevent hallucinations
            const TOP_K_LIMIT = 10;           // Maximum chunks to send to the LLM to save token quota

            const searchResults = await this.prisma.$queryRaw<Array<{ text: string, similarity: number }>>`
                SELECT 
                text, 
                1 - (embedding <=> ${vectorString}::vector) as similarity
                FROM "DocumentChunk"
                WHERE 1 - (embedding <=> ${vectorString}::vector) > ${SIMILARITY_THRESHOLD}
                ORDER BY embedding <=> ${vectorString}::vector
                LIMIT ${TOP_K_LIMIT};
            `;

            this.logger.log(`Found ${searchResults.length} relevant chunks from the database.`);

            if (searchResults.length === 0) {
                this.logger.warn('No relevant documents found. Short-circuiting LLM call to save API quota.');
                return {
                    query: userMessage,
                    answer: "I do not have enough information in the provided documents to answer this question.",
                    sourcesUsed: 0
                };
            }

            // Combine the retrieved text chunks into a single block of context
            const context = searchResults.map(res => res.text).join('\n\n---\n\n');

            // 3. Orchestrate the System Prompt with retrieved context
            this.logger.log('Orchestrating system prompt with retrieved context...');

            const prompt = `
                You are an expert technical assistant. Your job is to answer the user's question using ONLY the provided context. 
                If the context does not contain the answer, politely state that you do not know based on the provided documents.
                Do not hallucinate or make up information.

                CONTEXT:
                ${context}

                USER QUESTION:
                ${userMessage}
            `;

            // 4. Generate the final answer using Gemini 2.5 Flash
            this.logger.log('Calling Gemini 2.5 Flash for final synthesis...');
            const chatModel = this.ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

            const llmResponse = await chatModel.generateContent(prompt);
            const finalAnswer = llmResponse.response.text();

            this.logger.log('Successfully generated RAG response.');

            return {
                query: userMessage,
                answer: finalAnswer,
                sourcesUsed: searchResults.length
            };

        } catch (error) {
            this.logger.error('Failed to process AI Retrieval layer', error);
            throw new InternalServerErrorException('Failed to process AI Retrieval layer.');
        }
    }
}