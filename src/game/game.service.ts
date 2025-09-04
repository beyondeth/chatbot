import { Injectable, Logger } from '@nestjs/common';
import { RpsChoice, RpsResult } from './enums/game.enum';
import { RpsGameResult } from './interfaces/game-result.interface';
import { PlayRpsDto } from './dto/play-rps.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private prisma: PrismaService,
    private userService: UserService,
  ) {}

  // 가위바위보 승리 규칙
  private readonly rpsWinRules = {
    [RpsChoice.ROCK]: RpsChoice.SCISSORS,
    [RpsChoice.SCISSORS]: RpsChoice.PAPER,
    [RpsChoice.PAPER]: RpsChoice.ROCK,
  };

  // 포인트 설정
  private readonly rpsPoints = {
    [RpsResult.WIN]: 20,
    [RpsResult.LOSE]: -10,
    [RpsResult.DRAW]: 0,
  };

  // 임시 연승 기록 저장 (추후 DB로 이동)
  private streakRecord: Map<string, number> = new Map();

  /**
   * 가위바위보 게임 실행
   */
  async playRps(dto: PlayRpsDto): Promise<RpsGameResult> {
    try {
      // 봇의 선택 (랜덤)
      const botChoice = this.getBotChoice();

      // 게임 결과 판정
      const result = this.determineRpsResult(dto.choice, botChoice);

      // 포인트 계산
      const points = this.rpsPoints[result];

      // 연승 처리
      const streak = this.updateStreak(dto.sender, result);

      // 사용자 조회/생성
      const user = await this.userService.findOrCreateUser(dto.sender, dto.sender);

      // 특별 이벤트 체크
      const event = this.isSpecialEvent();
      const finalPoints = event.isEvent ? Math.floor(points * event.multiplier) : points;

      // 게임 결과 DB 저장 (트랜잭션)
      await this.prisma.$transaction(async (tx) => {
        // 게임 기록 저장
        await tx.gameHistory.create({
          data: {
            userId: user.id,
            roomId: dto.roomId,
            gameType: 'rps',
            userChoice: dto.choice,
            botChoice,
            result,
            pointChange: finalPoints,
            details: {
              streak,
              event: event.isEvent ? event.message : null,
            },
          },
        });

        // 포인트 업데이트 (승리/패배 시)
        if (finalPoints !== 0) {
          await this.userService.updatePoints(
            dto.sender,
            finalPoints,
            result === RpsResult.WIN ? 'game_win' : 'game_lose',
            { gameType: 'rps', streak },
          );
        }

        // 경험치 추가
        const expGain = result === RpsResult.WIN ? 10 : 5;
        await this.userService.addExperience(dto.sender, expGain);
      });

      // 로그 기록
      this.logger.log(
        `RPS Game - User: ${dto.sender}, Room: ${dto.roomId}, ` +
          `Choice: ${dto.choice} vs ${botChoice}, Result: ${result}, Points: ${finalPoints}` +
          (event.isEvent ? ` (${event.message})` : ''),
      );

      return {
        userChoice: dto.choice,
        botChoice,
        result,
        points: finalPoints,
        streak,
        eventMessage: event.isEvent ? event.message : undefined,
      };
    } catch (error) {
      this.logger.error(`RPS game error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 봇의 선택을 랜덤으로 결정
   */
  private getBotChoice(): RpsChoice {
    const choices = Object.values(RpsChoice);
    const randomIndex = Math.floor(Math.random() * choices.length);
    return choices[randomIndex];
  }

  /**
   * 가위바위보 결과 판정
   */
  private determineRpsResult(userChoice: RpsChoice, botChoice: RpsChoice): RpsResult {
    if (userChoice === botChoice) {
      return RpsResult.DRAW;
    }

    if (this.rpsWinRules[userChoice] === botChoice) {
      return RpsResult.WIN;
    }

    return RpsResult.LOSE;
  }

  /**
   * 연승 기록 업데이트
   */
  private updateStreak(userId: string, result: RpsResult): number {
    const currentStreak = this.streakRecord.get(userId) || 0;

    if (result === RpsResult.WIN) {
      const newStreak = currentStreak + 1;
      this.streakRecord.set(userId, newStreak);
      return newStreak;
    } else if (result === RpsResult.LOSE) {
      this.streakRecord.set(userId, 0);
      return 0;
    }

    // 무승부는 연승 유지
    return currentStreak;
  }

  /**
   * 특별 이벤트 체크 (시간대별 보너스 등)
   */
  isSpecialEvent(): { isEvent: boolean; multiplier: number; message?: string } {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // 매시 정각 이벤트
    if (minute === 0) {
      return {
        isEvent: true,
        multiplier: 2,
        message: '🎰 정각 이벤트! 포인트 2배!',
      };
    }

    // 행운의 시간 (7시)
    if (hour === 7 || hour === 19) {
      return {
        isEvent: true,
        multiplier: 1.5,
        message: '🍀 행운의 시간! 포인트 1.5배!',
      };
    }

    return { isEvent: false, multiplier: 1 };
  }
}
