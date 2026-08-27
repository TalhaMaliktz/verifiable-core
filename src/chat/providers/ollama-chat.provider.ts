import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IChatProvider } from '../interfaces/chat-provider.interface';
import ollama from 'ollama';

@Injectable()
export class OllamaChatProvider implements IChatProvider {
    private readonly logger = new Logger(OllamaChatProvider.name);
    readonly providerName = 'ollama';
    private readonly modelName: string;

    constructor(private readonly configService: ConfigService) {
        this.modelName = this.configService.get<string>('OLLAMA_CHAT_MODEL') || 'qwen2.5:7b';
    }

    async generateAnswer(prompt: string): Promise<string> {
        try {
            this.logger.log(`Generating text locally via Ollama model: ${this.modelName}`);

            const response = await ollama.chat({
                model: this.modelName,
                messages: [{ role: 'user', content: prompt }],
            });

            return response.message.content;
        } catch (error) {
            this.logger.error(`Ollama chat generation failed: ${(error as Error).message}`);
            throw error;
        }
    }
}