import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 사용자 조회 또는 생성
   */
  async findOrCreateUser(kakaoId: string, nickname: string): Promise<User> {
    try {
      // 기존 사용자 찾기
      let user = await this.prisma.user.findUnique({
        where: { kakaoId },
      });

      // 없으면 새로 생성
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            kakaoId,
            nickname,
          },
        });
        this.logger.log(`새 사용자 생성: ${nickname} (${kakaoId})`);
      } else {
        // 닉네임이 변경되었으면 업데이트
        if (user.nickname !== nickname) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { nickname },
          });
          this.logger.log(`사용자 닉네임 업데이트: ${user.nickname} → ${nickname}`);
        }
      }

      return user;
    } catch (error) {
      this.logger.error(`사용자 조회/생성 오류: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 사용자 정보 조회
   */
  async getUserInfo(kakaoId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { kakaoId },
    });
  }

  /**
   * 포인트 추가/차감
   */
  async updatePoints(
    kakaoId: string,
    points: number,
    reason: string,
    metadata?: any,
  ): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { kakaoId },
    });

    if (!user) {
      throw new Error('사용자를 찾을 수 없습니다');
    }

    const newBalance = user.points + points;

    // 포인트가 0 미만이 되지 않도록
    if (newBalance < 0) {
      throw new Error('포인트가 부족합니다');
    }

    // 트랜잭션으로 포인트 업데이트와 이력 저장
    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { points: newBalance },
      }),
      this.prisma.pointHistory.create({
        data: {
          userId: user.id,
          points,
          reason,
          balance: newBalance,
          metadata,
        },
      }),
    ]);

    this.logger.log(
      `포인트 업데이트: ${user.nickname} (${points > 0 ? '+' : ''}${points}P) → ${newBalance}P`,
    );

    return updatedUser;
  }

  /**
   * 경험치 추가 및 레벨업 체크
   */
  async addExperience(kakaoId: string, exp: number): Promise<{
    user: User;
    leveledUp: boolean;
    newLevel?: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { kakaoId },
    });

    if (!user) {
      throw new Error('사용자를 찾을 수 없습니다');
    }

    const newExp = user.experience + exp;
    const newLevel = this.calculateLevel(newExp);
    const leveledUp = newLevel > user.level;

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        experience: newExp,
        level: newLevel,
      },
    });

    if (leveledUp) {
      // 레벨업 보상
      const levelReward = newLevel * 100; // 레벨당 100포인트
      await this.updatePoints(kakaoId, levelReward, 'level_up', { newLevel });
      
      this.logger.log(`레벨업! ${user.nickname}: Lv.${user.level} → Lv.${newLevel}`);
    }

    return {
      user: updatedUser,
      leveledUp,
      newLevel: leveledUp ? newLevel : undefined,
    };
  }

  /**
   * 경험치로 레벨 계산
   */
  private calculateLevel(exp: number): number {
    // 간단한 레벨 공식: 레벨당 필요 경험치가 증가
    // Lv.1: 0 EXP
    // Lv.2: 100 EXP
    // Lv.3: 300 EXP (100 + 200)
    // Lv.4: 600 EXP (100 + 200 + 300)
    let level = 1;
    let requiredExp = 0;

    while (exp >= requiredExp) {
      level++;
      requiredExp += level * 100;
    }

    return level - 1;
  }

  /**
   * 랭킹 조회
   */
  async getRankings(type: 'level' | 'points', limit = 10) {
    const orderBy = type === 'level' 
      ? { level: 'desc' as const, experience: 'desc' as const }
      : { points: 'desc' as const };

    return this.prisma.user.findMany({
      orderBy,
      take: limit,
      select: {
        nickname: true,
        level: true,
        experience: true,
        points: true,
      },
    });
  }

  /**
   * 채팅 활동 기록
   */
  async recordChatActivity(
    kakaoId: string,
    roomId: string,
    messageType: 'normal' | 'command' | 'url',
  ) {
    const user = await this.findOrCreateUser(kakaoId, kakaoId); // 닉네임이 없으면 임시로 kakaoId 사용

    await this.prisma.chatActivity.create({
      data: {
        userId: user.id,
        roomId,
        messageType,
      },
    });

    // 일반 메시지는 경험치 부여 (하루 제한 있음)
    if (messageType === 'normal') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayActivityCount = await this.prisma.chatActivity.count({
        where: {
          userId: user.id,
          messageType: 'normal',
          createdAt: {
            gte: today,
          },
        },
      });

      // 하루 최대 50개 메시지까지만 경험치 부여
      if (todayActivityCount <= 50) {
        await this.addExperience(kakaoId, 1);
      }
    }
  }
}