import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatFactory } from './chat.factory';
import { GeminiChatProvider } from './providers/gemini-chat.provider';
import { OllamaChatProvider } from './providers/ollama-chat.provider';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [PrismaModule, EmbeddingModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatFactory,
    GeminiChatProvider,
    OllamaChatProvider,
  ],
})
export class ChatModule { }