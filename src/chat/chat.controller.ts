import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('process')
  async processMessage(@Body() body: { roomId: string; message: string }) {
    const summaryText = await this.chatService.processMessage(
      body.roomId,
      body.message,
    );
    // Always return JSON with a summary field, even on error
    return {
      summary:
        typeof summaryText === 'string'
          ? summaryText
          : (summaryText?.summary ?? '요약 생성에 실패했습니다.'),
    };
  }

  @Get('history')
  async getHistory(@Query('roomId') roomId: string) {
    return this.chatService.getHistory(roomId);
  }
}
