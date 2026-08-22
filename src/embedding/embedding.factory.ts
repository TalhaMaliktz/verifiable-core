import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiEmbeddingProvider } from './providers/gemini.provider';
import { OllamaEmbeddingProvider } from './providers/ollama.provider';
import { IEmbeddingProvider } from './interfaces/embedding-provider.interface';

@Injectable()
export class EmbeddingFactory {
    private readonly providers = new Map<string, IEmbeddingProvider>();
    private readonly defaultProviderKey: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly geminiEmbeddingProvider: GeminiEmbeddingProvider,
        private readonly ollamaEmbeddingProvider: OllamaEmbeddingProvider,
    ) {
        // Register Gemini
        this.providers.set('gemini', this.geminiEmbeddingProvider);
        this.providers.set('gemini-embedding-001', this.geminiEmbeddingProvider);

        // Register Ollama
        this.providers.set('ollama', this.ollamaEmbeddingProvider);
        this.providers.set('nomic-embed-text', this.ollamaEmbeddingProvider);

        // Dynamic Default via .env (e.g. DEFAULT_EMBEDDING_PROVIDER="ollama")
        this.defaultProviderKey =
            this.configService.get<string>('DEFAULT_EMBEDDING_PROVIDER')?.toLowerCase() || 'gemini';
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