import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IEmbeddingProvider, EmbeddingResult } from "../interfaces/embedding-provider.interface";
import { Ollama } from "ollama";

@Injectable()
export class OllamaEmbeddingProvider implements IEmbeddingProvider {
    private readonly logger = new Logger(OllamaEmbeddingProvider.name);
    readonly modelName = "nomic-embed-text";
    readonly dimensions = 768;

    private readonly client: Ollama;

    constructor(private readonly configService: ConfigService) {
        const ollamaBaseURL = this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434';

        this.client = new Ollama({
            host: ollamaBaseURL,
        });
    }

    async embedText(text: string): Promise<EmbeddingResult> {
        try {
            const response = await this.client.embed({
                model: this.modelName,
                input: text,
            });

            const vector = response.embeddings[0];

            return {
                embedding: vector,
                dimensions: this.dimensions,
                model: this.modelName,
            };
        } catch (error) {
            this.logger.error(`Ollama local embedding failed: ${(error as Error).message}`);
            throw error;
        }
    }

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
        try {
            const response = await this.client.embed({
                model: this.modelName,
                input: texts,
            });

            return response.embeddings.map((vector) => ({
                embedding: vector,
                dimensions: this.dimensions,
                model: this.modelName,
            }));
        } catch (error) {
            this.logger.error(`Ollama batch embedding failed: ${(error as Error).message}`);
            throw error;
        }
    }
}