import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Post()
    @HttpCode(HttpStatus.OK)
    async askQuestion(@Body() requestDto: ChatRequestDto) {
        return this.chatService.processChatRequest(
            requestDto.message,
            requestDto.documentIds,
        );
    }
}