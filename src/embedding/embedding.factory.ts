import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiEmbeddingProvider } from './providers/gemini.provider';
import { OllamaEmbeddingProvider } from './providers/ollama.provider';
import { OpenAIEmbeddingProvider } from './providers/openai.provider';
import { IEmbeddingProvider } from './interfaces/embedding-provider.interface';

@Injectable()
export class EmbeddingFactory {
    private readonly providers = new Map<string, IEmbeddingProvider>();
    private readonly defaultProviderKey: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly geminiEmbeddingProvider: GeminiEmbeddingProvider,
        private readonly ollamaEmbeddingProvider: OllamaEmbeddingProvider,
        private readonly openAIEmbeddingProvider: OpenAIEmbeddingProvider,
    ) {
        this.providers.set('gemini', this.geminiEmbeddingProvider);
        this.providers.set('gemini-embedding-001', this.geminiEmbeddingProvider);

        this.providers.set('ollama', this.ollamaEmbeddingProvider);
        this.providers.set('nomic-embed-text', this.ollamaEmbeddingProvider);

        this.providers.set('openai', this.openAIEmbeddingProvider);
        this.providers.set('text-embedding-3-small', this.openAIEmbeddingProvider);

        this.defaultProviderKey =
            this.configService.get<string>('DEFAULT_EMBEDDING_PROVIDER')?.toLowerCase() || 'ollama';
    }

    getProvider(modelIdentifier?: string): IEmbeddingProvider {
        const targetKey = (modelIdentifier || this.defaultProviderKey).toLowerCase();
        const provider = this.providers.get(targetKey);

        if (!provider) {
            const availableProviders = Array.from(this.providers.keys()).join(', ');
            throw new NotFoundException(
                `Unsupported embedding provider: '${targetKey}'. Available: [${availableProviders}]`,
            );
        }

        return provider;
    }
}