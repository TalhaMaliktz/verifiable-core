import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { IChatProvider } from '../interfaces/chat-provider.interface';

@Injectable()
export class GeminiChatProvider implements IChatProvider {
    private readonly logger = new Logger(GeminiChatProvider.name);
    readonly providerName = 'gemini';
    private readonly modelName: string;
    private readonly ai: GoogleGenerativeAI;

    constructor(private readonly configService: ConfigService) {
        this.modelName = this.configService.get<string>('CHAT_MODEL') || 'gemini-2.5-flash';
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        this.ai = new GoogleGenerativeAI(apiKey || 'dummy-key');
    }

    async generateAnswer(systemPrompt: string, userPrompt: string): Promise<string> {
        try {
            this.logger.log(`Generating text via Gemini cloud model: ${this.modelName}`);
            const model = this.ai.getGenerativeModel({
                model: this.modelName,
                systemInstruction: systemPrompt,
            });
            const result = await model.generateContent(userPrompt);
            return result.response.text();
        } catch (error) {
            this.logger.error(`Gemini chat generation failed: ${(error as Error).message}`);
            throw error;
        }
    }
}