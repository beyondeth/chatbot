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

    // summaryText가 null이거나 summary 필드가 없을 때도 항상 JSON 반환
    let summary = '';
    if (typeof summaryText === 'string') {
      summary = summaryText;
    } else if (
      summaryText &&
      typeof summaryText === 'object' &&
      'summary' in summaryText
    ) {
      summary = summaryText.summary || '';
    }

    // <p> 태그로 분리 및 이모티콘 붙이기 (기존 로직 유지)
    const lines = summary
      .split(/<\/p>\s*<p>/g)
      .map((line) => line.replace(/<\/?p>/g, '').trim())
      .filter((line) => line.length > 0);
    const emojis = ['🚀', '⚙️', '🏢'];
    const decorated = lines.map((line, idx) => {
      const emoji = emojis[idx] || '👉';
      return `${emoji} ${line}`;
    });

    // 항상 JSON 형태로 반환
    return { summary: decorated.join('\n') || '요약 생성에 실패했습니다.' };
  }

  @Get('history')
  async getHistory(@Query('roomId') roomId: string) {
    return this.chatService.getHistory(roomId);
  }
}
