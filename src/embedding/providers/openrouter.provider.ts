import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmbeddingProvider, EmbeddingResult } from '../interfaces/embedding-provider.interface';
import OpenAI from 'openai';

@Injectable()
export class OpenRouterEmbeddingProvider implements IEmbeddingProvider {
    private readonly logger = new Logger(OpenRouterEmbeddingProvider.name);
    readonly modelName = 'openai/text-embedding-3-small';
    readonly dimensions = 1536;

    private readonly client: OpenAI;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
        if (!apiKey) {
            this.logger.warn('OPENROUTER_API_KEY is not configured in .env. OpenRouter provider will fail if invoked.');
        }

        this.client = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: apiKey || 'dummy-key',
            defaultHeaders: {
                'HTTP-Referer': 'https://verifiable-core.internal',
                'X-Title': 'Verifiable Core RAG Engine',
            },
        });
    }

    async embedText(text: string): Promise<EmbeddingResult> {
        try {
            const response = await this.client.embeddings.create({
                model: this.modelName,
                input: text,
            });

            return {
                embedding: response.data[0].embedding,
                dimensions: this.dimensions,
                model: this.modelName,
            };
        } catch (error) {
            this.logger.error(`OpenRouter embedding failed: ${(error as Error).message}`);
            throw error;
        }
    }

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
        try {
            const response = await this.client.embeddings.create({
                model: this.modelName,
                input: texts,
            });

            return response.data.map((item) => ({
                embedding: item.embedding,
                dimensions: this.dimensions,
                model: this.modelName,
            }));
        } catch (error) {
            this.logger.error(`OpenRouter batch embedding failed: ${(error as Error).message}`);
            throw error;
        }
    }
}