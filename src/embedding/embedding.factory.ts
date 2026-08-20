import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiEmbeddingProvider } from './providers/gemini.provider';
import { IEmbeddingProvider } from './interfaces/embedding-provider.interface';

@Injectable()
export class EmbeddingFactory {
    private readonly providers = new Map<string, IEmbeddingProvider>();
    private readonly defaultProviderKey: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly geminiEmbeddingProvider: GeminiEmbeddingProvider,
    ) {
        // 1. Register canonical names and short aliases
        this.providers.set('gemini', this.geminiEmbeddingProvider);
        this.providers.set('gemini-embedding-001', this.geminiEmbeddingProvider);

        // 2. Read default from environment or fallback to gemini
        this.defaultProviderKey =
            this.configService.get<string>('DEFAULT_EMBEDDING_PROVIDER')?.toLowerCase() || 'gemini';
    }

    getProvider(modelIdentifier?: string): IEmbeddingProvider {
        // Resolve target key: caller argument -> env default -> hardcoded fallback
        const targetKey = (modelIdentifier || this.defaultProviderKey).toLowerCase();

        const provider = this.providers.get(targetKey);

        if (!provider) {
            const availableProviders = Array.from(this.providers.keys()).join(', ');
            throw new NotFoundException(
                `Unsupported embedding provider: '${targetKey}'. Available providers: [${availableProviders}]`,
            );
        }

        return provider;
    }
}