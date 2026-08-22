import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { IEmbeddingProvider, EmbeddingResult } from "../interfaces/embedding-provider.interface";

@Injectable()
export class GeminiEmbeddingProvider implements IEmbeddingProvider {
    private readonly logger = new Logger(GeminiEmbeddingProvider.name);
    readonly modelName = "gemini-embedding-001";
    readonly dimensions = 3072;

    private readonly ai: GoogleGenerativeAI;
    private readonly embeddingModel: GenerativeModel;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not defined in environment variables.');
        }

        this.ai = new GoogleGenerativeAI(apiKey);
        this.embeddingModel = this.ai.getGenerativeModel({ model: this.modelName });
    }

    async embedText(text: string): Promise<EmbeddingResult> {
        try {
            const response = await this.embeddingModel.embedContent(text);
            const values = response.embedding.values;

            return {
                embedding: values,
                dimensions: this.dimensions,
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
}