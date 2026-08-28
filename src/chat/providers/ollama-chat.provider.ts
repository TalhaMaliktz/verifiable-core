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

    async generateAnswer(systemPrompt: string, userPrompt: string): Promise<string> {
        try {
            this.logger.log(`Generating text locally via Ollama model: ${this.modelName}`);

            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Ollama request timed out after 60 seconds.'));
                }, 60000);
            });

            const chatPromise = ollama.chat({
                model: this.modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
            });

            const response = await Promise.race([chatPromise, timeoutPromise]);
            return response.message.content;
        } catch (error) {
            this.logger.error(`Ollama chat generation failed: ${(error as Error).message}`);
            throw error;
        }
    }
}