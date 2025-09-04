import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UserService) {}

  /**
   * 사용자 정보 조회
   */
  @Get(':kakaoId')
  async getUserInfo(@Param('kakaoId') kakaoId: string) {
    const user = await this.userService.getUserInfo(kakaoId);
    
    if (!user) {
      return {
        success: false,
        message: '사용자를 찾을 수 없습니다',
      };
    }

    return {
      success: true,
      user: {
        nickname: user.nickname,
        level: user.level,
        experience: user.experience,
        points: user.points,
        isAdmin: user.isAdmin,
      },
    };
  }

  /**
   * 랭킹 조회
   */
  @Get('rankings/:type')
  async getRankings(
    @Param('type') type: 'level' | 'points',
    @Query('limit') limit?: string,
  ) {
    const rankings = await this.userService.getRankings(
      type,
      limit ? parseInt(limit, 10) : 10,
    );

    return {
      success: true,
      type,
      rankings: rankings.map((user, index) => ({
        rank: index + 1,
        ...user,
      })),
    };
  }
}