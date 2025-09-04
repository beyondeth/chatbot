import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('process')
  async processMessage(@Body() body: { roomId: string; message: string }) {
    console.log('요청 받음:', body.message);

    const result = await this.chatService.processMessage(body.roomId, body.message);

    // 결과가 null이면 봇이 반응하지 않도록 null 반환
    if (!result) {
      console.log('처리 결과: null (봇 반응 안함)');
      return { summary: null };
    }

    console.log('처리 결과: 요약 성공');
    return {
      summary: result.summary,
    };
  }

  @Get('history')
  async getHistory(@Query('roomId') roomId: string) {
    return this.chatService.getHistory(roomId);
  }

  // 테스트용 엔드포인트
  @Get('test')
  test() {
    return {
      status: 'ok',
      message: '서버가 정상 작동 중입니다',
      timestamp: new Date().toISOString(),
    };
  }
}
