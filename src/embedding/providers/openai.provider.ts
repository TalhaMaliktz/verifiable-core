import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmbeddingProvider, EmbeddingResult } from '../interfaces/embedding-provider.interface';
import OpenAI from 'openai';

@Injectable()
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
    private readonly logger = new Logger(OpenAIEmbeddingProvider.name);
    readonly modelName = 'text-embedding-3-small';
    readonly dimensions = 1536;

    private readonly client: OpenAI;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (!apiKey) {
            this.logger.warn('OPENAI_API_KEY is not configured in .env. Provider will throw if invoked.');
        }

        this.client = new OpenAI({
            apiKey: apiKey || 'dummy-key',
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
            this.logger.error(`OpenAI embedding failed: ${(error as Error).message}`);
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
            this.logger.error(`OpenAI batch embedding failed: ${(error as Error).message}`);
            throw error;
        }
    }
}