import { Module } from '@nestjs/common';
import { GeminiEmbeddingProvider } from './providers/gemini.provider';
import { OllamaEmbeddingProvider } from './providers/ollama.provider';
import { EmbeddingFactory } from './embedding.factory';

@Module({
    providers: [GeminiEmbeddingProvider, OllamaEmbeddingProvider, EmbeddingFactory],
    exports: [EmbeddingFactory],
})
export class EmbeddingModule { }