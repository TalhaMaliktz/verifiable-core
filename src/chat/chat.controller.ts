import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Post()
    @HttpCode(HttpStatus.OK) // Returns 200 OK instead of the default 201 Created
    async askQuestion(@Body() requestDto: ChatRequestDto) {
        // If the request reaches this line, it means the DTO validation passed.
        // We pass the clean, validated string to the Service.
        return this.chatService.processChatRequest(requestDto.message);
    }
}