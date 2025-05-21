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

    const safeSummary = typeof summaryText === 'string' ? summaryText : '';
    const lines = safeSummary
      .split(/<\/p>\s*<p>/g) // <p>문단별로 분리
      .map((line) => line.replace(/<\/?p>/g, '').trim()) // <p>, </p> 제거 및 trim
      .filter((line) => line.length > 0);

    // 이모티콘 리스트 (원하는대로 바꿔도 됨)
    const emojis = ['🚀', '⚙️', '🏢'];

    // 각 줄 앞에 이모티콘 붙이기
    const decorated = lines.map((line, idx) => {
      const emoji = emojis[idx] || '👉';
      return `${emoji} ${line}`;
    });

    // summary는 string으로 반환
    return { summary: decorated.join('\n') };
  }

  @Get('history')
  async getHistory(@Query('roomId') roomId: string) {
    return this.chatService.getHistory(roomId);
  }
}
