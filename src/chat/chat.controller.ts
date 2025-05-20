import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('process')
  async processMessage(@Body() body: { roomId: string; message: string }) {
    const result = await this.chatService.processMessage(
      body.roomId,
      body.message,
    );
    return result?.summary || '요약 결과 없음';
  }

  @Get('history')
  async getHistory(@Query('roomId') roomId: string) {
    return this.chatService.getHistory(roomId);
  }

  @Get('test-gemini')
  async testGemini() {
    return this.chatService.testGemini();
  }

  @Get('test-gemini-url')
  async testGeminiWithUrl() {
    return this.chatService.testGeminiWithUrl();
  }
}
