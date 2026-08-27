import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IChatProvider } from './interfaces/chat-provider.interface';
import { GeminiChatProvider } from './providers/gemini-chat.provider';
import { OllamaChatProvider } from './providers/ollama-chat.provider';

@Injectable()
export class ChatFactory {
    private readonly providers = new Map<string, IChatProvider>();
    private readonly defaultProviderKey: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly geminiChatProvider: GeminiChatProvider,
        private readonly ollamaChatProvider: OllamaChatProvider,
    ) {
        this.providers.set('gemini', this.geminiChatProvider);
        this.providers.set('ollama', this.ollamaChatProvider);

        this.defaultProviderKey =
            this.configService.get<string>('DEFAULT_CHAT_PROVIDER')?.toLowerCase() || 'gemini';
    }

    getProvider(providerIdentifier?: string): IChatProvider {
        const targetKey = (providerIdentifier || this.defaultProviderKey).toLowerCase();
        const provider = this.providers.get(targetKey);

        if (!provider) {
            const available = Array.from(this.providers.keys()).join(', ');
            throw new NotFoundException(
                `Unsupported chat provider: '${targetKey}'. Available: [${available}]`,
            );
        }

        return provider;
    }
}