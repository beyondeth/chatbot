# 구현 계획서

## 📋 구현 순서 및 모듈 구조

### Phase 1: 기초 인프라 구축

#### 1-1. 데이터베이스 마이그레이션
```bash
# 새로운 스키마 적용
npx prisma migrate dev --name add_gamification_features

# Prisma Client 재생성
npx prisma generate
```

#### 1-2. 모듈 구조 생성
```
src/
├── users/              # 사용자 관리
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── dto/
├── chat-stats/         # 채팅 통계
│   ├── chat-stats.module.ts
│   ├── chat-stats.controller.ts
│   ├── chat-stats.service.ts
│   └── dto/
├── game/               # 게임 기능
│   ├── game.module.ts
│   ├── game.controller.ts
│   ├── game.service.ts
│   └── dto/
├── points/             # 포인트 시스템
│   ├── points.module.ts
│   ├── points.controller.ts
│   ├── points.service.ts
│   └── dto/
├── news/               # 뉴스 크롤링
│   ├── news.module.ts
│   ├── news.controller.ts
│   ├── news.service.ts
│   └── dto/
├── alarm/              # 알람 시스템
│   ├── alarm.module.ts
│   ├── alarm.controller.ts
│   ├── alarm.service.ts
│   └── dto/
└── common/             # 공통 유틸리티
    ├── guards/
    ├── interceptors/
    └── decorators/
```

### Phase 2: 핵심 모듈 구현

#### 2-1. Users Module

**users.module.ts**
```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

**users.service.ts - 핵심 메서드**
```typescript
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // 사용자 등록 또는 정보 업데이트
  async upsertUser(kakaoId: string, nickname: string): Promise<User> {
    return this.prisma.user.upsert({
      where: { kakaoId },
      update: { nickname },
      create: { kakaoId, nickname },
    });
  }

  // 활동 기록
  async recordActivity(
    kakaoId: string,
    roomId: string,
    messageType: string,
  ): Promise<void> {
    const user = await this.upsertUser(kakaoId, kakaoId);
    
    await this.prisma.chatActivity.create({
      data: {
        userId: user.id,
        roomId,
        messageType,
      },
    });

    // 경험치 증가
    const expGain = this.getExpForActivity(messageType);
    await this.addExperience(user.id, expGain);
  }

  // 경험치 추가 및 레벨업 체크
  async addExperience(userId: number, exp: number): Promise<LevelUpResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const newExp = user.experience + exp;
    
    const oldLevel = this.calculateLevel(user.experience);
    const newLevel = this.calculateLevel(newExp);
    
    const leveledUp = newLevel > oldLevel;
    
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        experience: newExp,
        level: newLevel,
      },
    });

    if (leveledUp) {
      // 레벨업 보상
      const reward = await this.getLevelReward(newLevel);
      await this.prisma.pointHistory.create({
        data: {
          userId,
          points: reward,
          reason: 'level_up',
          balance: user.points + reward,
        },
      });
    }

    return { leveledUp, newLevel, reward: leveledUp ? reward : 0 };
  }

  // 일일 출석 체크
  async dailyCheck(kakaoId: string): Promise<DailyCheckResult> {
    const user = await this.findByKakaoId(kakaoId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.dailyCheck.findUnique({
      where: {
        userId_checkDate: {
          userId: user.id,
          checkDate: today,
        },
      },
    });

    if (existing) {
      return { success: false, message: '이미 출석했습니다' };
    }

    // 연속 출석 확인
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const yesterdayCheck = await this.prisma.dailyCheck.findUnique({
      where: {
        userId_checkDate: {
          userId: user.id,
          checkDate: yesterday,
        },
      },
    });

    const streak = yesterdayCheck ? yesterdayCheck.streak + 1 : 1;
    const baseReward = 100;
    const streakBonus = Math.floor(streak / 7) * 50; // 7일마다 50 보너스
    const totalReward = baseReward + streakBonus;

    await this.prisma.dailyCheck.create({
      data: {
        userId: user.id,
        checkDate: today,
        streak,
        pointReward: totalReward,
      },
    });

    await this.prisma.pointHistory.create({
      data: {
        userId: user.id,
        points: totalReward,
        reason: 'daily_check',
        balance: user.points + totalReward,
        metadata: { streak },
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { points: { increment: totalReward } },
    });

    return {
      success: true,
      streak,
      points: totalReward,
      bonus: streakBonus,
    };
  }
}
```

#### 2-2. ChatStats Module

**chat-stats.service.ts - 핵심 메서드**
```typescript
export class ChatStatsService {
  constructor(private prisma: PrismaService) {}

  async getChatRanking(
    roomId: string,
    period: string,
    type: 'all' | 'command' = 'all',
  ): Promise<ChatRankingItem[]> {
    const { start, end } = this.getDateRange(period);
    
    const activities = await this.prisma.chatActivity.groupBy({
      by: ['userId'],
      where: {
        roomId,
        createdAt: {
          gte: start,
          lte: end,
        },
        ...(type === 'command' && { messageType: 'command' }),
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          _all: 'desc',
        },
      },
      take: 20,
    });

    // 사용자 정보 조회
    const userIds = activities.map(a => a.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    return activities.map((activity, index) => ({
      rank: index + 1,
      user: userMap.get(activity.userId),
      count: activity._count._all,
      percentage: 0, // 나중에 계산
    }));
  }

  async getRoomStats(roomId: string): Promise<RoomStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalMessages, todayMessages, activeUsers] = await Promise.all([
      this.prisma.chatActivity.count({ where: { roomId } }),
      this.prisma.chatActivity.count({
        where: {
          roomId,
          createdAt: { gte: today },
        },
      }),
      this.prisma.chatActivity.groupBy({
        by: ['userId'],
        where: { roomId },
        _count: true,
      }),
    ]);

    return {
      totalMessages,
      todayMessages,
      activeUsers: activeUsers.length,
    };
  }

  private getDateRange(period: string): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date();
    const end = new Date();

    switch (period) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'thisWeek':
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case 'lastWeek':
        start.setDate(start.getDate() - start.getDay() - 7);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - end.getDay() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'thisMonth':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'lastMonth':
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'all':
      default:
        start.setFullYear(2020);
        break;
    }

    return { start, end: period.includes('last') || period === 'yesterday' ? end : now };
  }
}
```

#### 2-3. Game Module

**game.service.ts - 게임 로직**
```typescript
export class GameService {
  constructor(
    private prisma: PrismaService,
    private pointsService: PointsService,
  ) {}

  async playOddEven(
    kakaoId: string,
    choice: 'odd' | 'even',
  ): Promise<OddEvenResult> {
    const user = await this.prisma.user.findUnique({ where: { kakaoId } });
    
    // 포인트 확인
    if (user.points < 10) {
      throw new BadRequestException('포인트가 부족합니다 (최소 10포인트)');
    }

    // 주사위 굴리기
    const dice = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
    ];
    const total = dice.reduce((sum, d) => sum + d, 0);
    const result = total % 2 === 0 ? 'even' : 'odd';
    const win = choice === result;

    const pointChange = win ? 30 : -10;

    // 게임 기록 저장
    await this.prisma.gameHistory.create({
      data: {
        userId: user.id,
        roomId: '', // 봇에서 전달
        gameType: 'oddeven',
        userChoice: choice,
        result: win ? 'win' : 'lose',
        pointChange,
        details: { dice, total },
      },
    });

    // 포인트 업데이트
    await this.pointsService.updatePoints(
      user.id,
      pointChange,
      win ? 'game_win' : 'game_lose',
    );

    return {
      dice,
      total,
      result,
      win,
      points: pointChange,
    };
  }

  async playRPS(
    kakaoId: string,
    choice: 'rock' | 'paper' | 'scissors',
  ): Promise<RPSResult> {
    const user = await this.prisma.user.findUnique({ where: { kakaoId } });
    
    if (user.points < 10) {
      throw new BadRequestException('포인트가 부족합니다 (최소 10포인트)');
    }

    const choices = ['rock', 'paper', 'scissors'];
    const botChoice = choices[Math.floor(Math.random() * 3)] as typeof choice;

    const wins = {
      rock: 'scissors',
      scissors: 'paper',
      paper: 'rock',
    };

    let result: 'win' | 'lose' | 'draw';
    let pointChange = 0;

    if (choice === botChoice) {
      result = 'draw';
      pointChange = 0;
    } else if (wins[choice] === botChoice) {
      result = 'win';
      pointChange = 20;
    } else {
      result = 'lose';
      pointChange = -10;
    }

    await this.prisma.gameHistory.create({
      data: {
        userId: user.id,
        roomId: '',
        gameType: 'rps',
        userChoice: choice,
        botChoice,
        result,
        pointChange,
      },
    });

    if (pointChange !== 0) {
      await this.pointsService.updatePoints(
        user.id,
        pointChange,
        result === 'win' ? 'game_win' : 'game_lose',
      );
    }

    return {
      userChoice: choice,
      botChoice,
      result,
      points: pointChange,
    };
  }
}
```

#### 2-4. News Module

**news.service.ts - 네이버 뉴스 크롤링**
```typescript
import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class NewsService {
  private readonly categories = {
    정치: '100',
    경제: '101',
    사회: '102',
    생활문화: '103',
    세계: '104',
    IT과학: '105',
    연예: '106',
    스포츠: '107',
  };

  async getNews(category?: string): Promise<NewsResult> {
    if (category && this.categories[category]) {
      return this.getCategoryNews(category);
    }
    return this.getAllCategoryNews();
  }

  private async getCategoryNews(category: string): Promise<NewsItem[]> {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
      const categoryCode = this.categories[category];
      await page.goto(
        `https://news.naver.com/main/main.naver?mode=LSD&mid=shm&sid1=${categoryCode}`,
        { waitUntil: 'networkidle2' }
      );

      const news = await page.evaluate(() => {
        const items = [];
        const headlines = document.querySelectorAll('.cluster_text_headline');
        
        headlines.forEach((headline, index) => {
          if (index >= 5) return; // 상위 5개만
          
          const link = headline.querySelector('a');
          const timeElement = headline.parentElement?.querySelector('.cluster_text_info');
          
          if (link) {
            items.push({
              title: link.textContent?.trim() || '',
              link: link.getAttribute('href') || '',
              time: timeElement?.textContent?.trim() || '',
            });
          }
        });
        
        return items;
      });

      return news;
    } finally {
      await browser.close();
    }
  }

  private async getAllCategoryNews(): Promise<CategoryNews[]> {
    const results = [];
    
    for (const [category, code] of Object.entries(this.categories)) {
      const items = await this.getCategoryNews(category);
      results.push({
        category,
        items: items.slice(0, 2), // 카테고리별 2개씩
      });
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
  }
}
```

#### 2-5. Alarm Module

**alarm.service.ts - 알람 스케줄링**
```typescript
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlarmService {
  constructor(private prisma: PrismaService) {}

  async createAlarm(
    roomId: string,
    time: string,
    message: string,
    createdBy: string,
  ): Promise<Alarm> {
    // 시간을 cron 표현식으로 변환
    const [hour, minute] = time.split(':');
    const cronPattern = `0 ${minute} ${hour} * * *`;

    return this.prisma.alarm.create({
      data: {
        roomId,
        message,
        cronPattern,
        createdBy,
      },
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkAlarms() {
    const now = new Date();
    const currentTime = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    const alarms = await this.prisma.alarm.findMany({
      where: {
        isActive: true,
      },
      include: {
        room: true,
      },
    });

    for (const alarm of alarms) {
      if (this.shouldTrigger(alarm.cronPattern, now)) {
        // 카카오톡으로 메시지 전송
        await this.sendAlarmMessage(alarm.roomId, alarm.message);
      }
    }
  }

  private shouldTrigger(cronPattern: string, now: Date): boolean {
    // cron 패턴 파싱 및 현재 시간과 비교
    const parts = cronPattern.split(' ');
    const minute = parseInt(parts[1]);
    const hour = parseInt(parts[2]);

    return now.getHours() === hour && now.getMinutes() === minute;
  }

  private async sendAlarmMessage(roomId: string, message: string) {
    // 메신저봇R과 통신하여 메시지 전송
    // 실제 구현은 메신저봇R의 API에 따라 달라짐
    console.log(`알람 발송: ${roomId} - ${message}`);
  }
}
```

### Phase 3: 보안 및 권한 관리

#### 3-1. Admin Guard

**guards/admin.guard.ts**
```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const kakaoId = request.body.kakaoId || request.params.kakaoId;

    if (!kakaoId) {
      return false;
    }

    try {
      const user = await this.usersService.findByKakaoId(kakaoId);
      return user && user.isAdmin;
    } catch {
      return false;
    }
  }
}
```

#### 3-2. Rate Limiting

**interceptors/rate-limit.interceptor.ts**
```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private requests = new Map<string, number[]>();
  private readonly maxRequests = 60;
  private readonly windowMs = 60000; // 1분

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const key = request.ip || request.body.kakaoId || 'unknown';

    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    
    // 오래된 요청 제거
    const recentRequests = userRequests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    if (recentRequests.length >= this.maxRequests) {
      throw new Error('Too many requests');
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return next.handle();
  }
}
```

### Phase 4: 초기 데이터 설정

#### 4-1. 레벨 설정 시더

**prisma/seed.ts**
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 레벨 설정
  const levels = [];
  for (let level = 1; level <= 100; level++) {
    const expRequired = 100 * level * (level + 1) / 2;
    const pointReward = level * 10 + (level % 10 === 0 ? level * 10 : 0);
    
    levels.push({
      level,
      expRequired,
      pointReward,
      title: getTitle(level),
    });
  }

  await prisma.levelConfig.createMany({
    data: levels,
    skipDuplicates: true,
  });

  // 기본 명령어
  const commands = [
    // 정보 조회
    { command: '!프로필', description: '내 정보 확인', category: 'info', usage: '!프로필' },
    { command: '!레벨순위', description: '레벨 순위 TOP 10', category: 'info', usage: '!레벨순위' },
    { command: '!포인트순위', description: '포인트 순위 TOP 10', category: 'info', usage: '!포인트순위' },
    
    // 게임
    { command: '!홀짝', description: '주사위 홀짝 맞추기', category: 'game', usage: '!홀짝 [홀/짝]' },
    { command: '!가위바위보', description: '가위바위보 게임', category: 'game', usage: '!가위바위보 [가위/바위/보]' },
    
    // 기타
    { command: '!뉴스', description: '네이버 실시간 뉴스', category: 'fun', usage: '!뉴스 [카테고리]' },
    { command: '!출석', description: '일일 출석 체크', category: 'fun', usage: '!출석' },
    { command: '!도움말', description: '명령어 목록', category: 'info', usage: '!도움말' },
    
    // 관리자
    { command: '!채팅순위', description: '채팅 순위 조회', category: 'admin', usage: '!채팅순위 [기간]', isAdminOnly: true },
    { command: '!알람추가', description: '알람 등록', category: 'admin', usage: '!알람추가 [시간] [메시지]', isAdminOnly: true },
    { command: '!포인트지급', description: '포인트 지급', category: 'admin', usage: '!포인트지급 @닉네임 [포인트]', isAdminOnly: true },
  ];

  await prisma.command.createMany({
    data: commands,
    skipDuplicates: true,
  });

  console.log('Seed 완료!');
}

function getTitle(level: number): string {
  if (level >= 100) return '전설';
  if (level >= 80) return '마스터';
  if (level >= 60) return '전문가';
  if (level >= 40) return '숙련자';
  if (level >= 20) return '중급자';
  return '초보자';
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Phase 5: 환경 설정

#### 5-1. 환경 변수 추가

**.env.example**
```env
# 기존
DATABASE_URL="postgresql://user:password@localhost:5432/chatbot"
GEMINI_API_KEY="your-gemini-api-key"

# 추가
JWT_SECRET="your-jwt-secret"
NAVER_NEWS_API_KEY="optional-naver-api-key"
REDIS_URL="redis://localhost:6379"
BOT_WEBHOOK_SECRET="webhook-secret-for-security"

# 게임 설정
GAME_MIN_BET=10
GAME_MAX_BET=1000
ODDEVEN_WIN_MULTIPLIER=3
RPS_WIN_MULTIPLIER=2

# 포인트 설정
DAILY_CHECK_POINTS=100
LEVEL_UP_POINTS=50
STREAK_BONUS_DAYS=7
STREAK_BONUS_POINTS=50

# 레이트 리밋
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
```

#### 5-2. AppModule 업데이트

**app.module.ts**
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { ChatModule } from './chat/chat.module';
import { UsersModule } from './users/users.module';
import { ChatStatsModule } from './chat-stats/chat-stats.module';
import { GameModule } from './game/game.module';
import { PointsModule } from './points/points.module';
import { NewsModule } from './news/news.module';
import { AlarmModule } from './alarm/alarm.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 60,
    }),
    PrismaModule,
    ChatModule,
    UsersModule,
    ChatStatsModule,
    GameModule,
    PointsModule,
    NewsModule,
    AlarmModule,
  ],
})
export class AppModule {}
```

## 테스트 계획

### 단위 테스트
- 각 서비스 메서드별 테스트
- 게임 로직 정확성 검증
- 포인트 계산 정확성 검증

### 통합 테스트
- API 엔드포인트 테스트
- 권한 검증 테스트
- 동시성 테스트

### 부하 테스트
- 동시 사용자 처리 능력
- 데이터베이스 쿼리 성능
- 캐싱 효과 측정

## 배포 체크리스트

1. [ ] 데이터베이스 마이그레이션 완료
2. [ ] 환경 변수 설정
3. [ ] Redis 서버 구성
4. [ ] SSL 인증서 설정
5. [ ] 로깅 및 모니터링 설정
6. [ ] 백업 정책 수립
7. [ ] 봇 클라이언트 업데이트
8. [ ] 관리자 계정 설정
9. [ ] 초기 데이터 시딩
10. [ ] 성능 테스트 완료