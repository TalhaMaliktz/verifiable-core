import { Module } from '@nestjs/common';
import { GeminiEmbeddingProvider } from './providers/gemini.provider';
import { OllamaEmbeddingProvider } from './providers/ollama.provider';
import { OpenAIEmbeddingProvider } from './providers/openai.provider';
import { OpenRouterEmbeddingProvider } from './providers/openrouter.provider';
import { EmbeddingFactory } from './embedding.factory';

@Module({
    providers: [
        GeminiEmbeddingProvider,
        OllamaEmbeddingProvider,
        OpenAIEmbeddingProvider,
        OpenRouterEmbeddingProvider,
        EmbeddingFactory,
    ],
    exports: [EmbeddingFactory],
})
export class EmbeddingModule { }