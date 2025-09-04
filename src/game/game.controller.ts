import { Controller, Post, Body, Get, Param, Logger } from '@nestjs/common';
import { GameService } from './game.service';
import { PlayRpsDto } from './dto/play-rps.dto';
import { RpsGameResult } from './interfaces/game-result.interface';

@Controller('game')
export class GameController {
  private readonly logger = new Logger(GameController.name);

  constructor(private readonly gameService: GameService) {}

  /**
   * 가위바위보 게임 실행
   */
  @Post('rps')
  async playRps(@Body() dto: PlayRpsDto): Promise<RpsGameResult> {
    this.logger.log(`RPS game request from ${dto.sender} in room ${dto.roomId}`);
    return this.gameService.playRps(dto);
  }

  /**
   * 특별 이벤트 확인
   */
  @Get('event')
  checkEvent() {
    return this.gameService.isSpecialEvent();
  }

  /**
   * 게임 통계 조회 (추후 구현)
   */
  @Get('stats/:userId')
  getGameStats(@Param('userId') userId: string) {
    // TODO: DB 연동 후 구현
    return {
      message: '통계 기능은 추후 구현 예정입니다.',
      userId,
    };
  }
}
