import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { IEmbeddingProvider, EmbeddingResult } from "../interfaces/embedding-provider.interface";

interface ExtendedEmbedContentRequest {
    content: { role: string; parts: { text: string }[] };
    outputDimensionality?: number;
}

@Injectable()
export class GeminiEmbeddingProvider implements IEmbeddingProvider {
    private readonly logger = new Logger(GeminiEmbeddingProvider.name);
    readonly modelName = "gemini-embedding-001";
    readonly dimensions = 1536;

    private readonly ai: GoogleGenerativeAI;
    private readonly embeddingModel: GenerativeModel;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            this.logger.warn('GEMINI_API_KEY is not configured in .env. Gemini provider will fail if invoked.');
        }

        this.ai = new GoogleGenerativeAI(apiKey || 'dummy-key');
        this.embeddingModel = this.ai.getGenerativeModel({ model: this.modelName });
    }

    async embedText(text: string): Promise<EmbeddingResult> {
        try {
            const payload: ExtendedEmbedContentRequest = {
                content: { role: 'user', parts: [{ text }] },
                outputDimensionality: this.dimensions,
            };

            const response = await this.embeddingModel.embedContent(
                payload,
            );

            let values = response.embedding.values;

            if (values.length > this.dimensions) {
                values = this.normalizeSubspace(values.slice(0, this.dimensions));
            }

            return {
                embedding: values,
                dimensions: values.length,
                model: this.modelName,
            };
        } catch (error) {
            this.logger.error(`Gemini embedding failed: ${(error as Error).message}`);
            throw error;
        }
    }

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
        const results: EmbeddingResult[] = [];
        for (let i = 0; i < texts.length; i++) {
            const result = await this.embedText(texts[i]);
            results.push(result);

            if (i < texts.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 4200));
            }
        }
        return results;
    }

    private normalizeSubspace(vector: number[]): number[] {
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        return norm === 0 ? vector : vector.map((val) => val / norm);
    }
}