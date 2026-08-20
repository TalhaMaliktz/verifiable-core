import { Module } from '@nestjs/common';
import { GeminiEmbeddingProvider } from './providers/gemini.provider';
import { EmbeddingFactory } from './embedding.factory';

@Module({
    providers: [GeminiEmbeddingProvider, EmbeddingFactory],
    exports: [EmbeddingFactory],
})
export class EmbeddingModule { }