# 카카오톡 채팅봇 시스템 설계 문서

## 📋 목차
1. [개요](#개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [데이터베이스 설계](#데이터베이스-설계)
4. [기능별 상세 설계](#기능별-상세-설계)
5. [API 설계](#api-설계)
6. [보안 및 권한 관리](#보안-및-권한-관리)
7. [구현 계획](#구현-계획)

## 개요

### 프로젝트 목표
기존 YouTube/뉴스 요약 봇에 다음 기능들을 추가:
- 채팅 순위 시스템 (관리자 전용)
- 경험치/레벨 시스템
- 포인트 시스템
- 네이버 실시간 뉴스
- 알람 시스템
- 미니 게임 (홀짝, 가위바위보)

### 기술 스택
- Backend: NestJS, Prisma ORM
- Database: PostgreSQL (Supabase)
- Bot Client: 메신저봇R (KakaoTalk)
- API: Google Gemini AI

## 시스템 아키텍처

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   KakaoTalk     │────▶│  메신저봇R Client │────▶│   NestJS API    │
│     Users       │◀────│   (JavaScript)    │◀────│   (Backend)     │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                            │
                                ┌───────────────────────────┼───────────────────┐
                                │                           │                   │
                        ┌───────▼──────┐           ┌───────▼──────┐    ┌───────▼──────┐
                        │  PostgreSQL  │           │  Gemini AI   │    │ Naver News   │
                        │  (Supabase)  │           │     API      │    │   Crawler    │
                        └──────────────┘           └──────────────┘    └──────────────┘
```

## 데이터베이스 설계

### 기존 테이블
```prisma
model ChatMessage {
  id        Int      @id @default(autoincrement())
  roomId    String
  message   String
  url       String?
  summary   String?
  createdAt DateTime @default(now())
}
```

### 새로운 테이블 설계

#### 1. User (사용자)
```prisma
model User {
  id          Int       @id @default(autoincrement())
  kakaoId     String    @unique // 카카오톡 사용자 ID
  nickname    String
  isAdmin     Boolean   @default(false)
  level       Int       @default(1)
  experience  Int       @default(0)
  points      Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // Relations
  messages    ChatActivity[]
  games       GameHistory[]
  rewards     PointHistory[]
}
```

#### 2. ChatActivity (채팅 활동)
```prisma
model ChatActivity {
  id          Int       @id @default(autoincrement())
  userId      Int
  roomId      String
  messageType String    // 'normal', 'command', 'url'
  createdAt   DateTime  @default(now())
  
  // Relations
  user        User      @relation(fields: [userId], references: [id])
  
  @@index([userId, roomId, createdAt])
  @@index([roomId, createdAt])
}
```

#### 3. Room (채팅방)
```prisma
model Room {
  id          Int       @id @default(autoincrement())
  roomId      String    @unique
  roomName    String?
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  
  // Relations
  alarms      Alarm[]
}
```

#### 4. GameHistory (게임 기록)
```prisma
model GameHistory {
  id          Int       @id @default(autoincrement())
  userId      Int
  gameType    String    // 'oddeven', 'rps'
  userChoice  String?   // 사용자 선택
  botChoice   String?   // 봇 선택
  result      String    // 'win', 'lose', 'draw'
  pointChange Int       @default(0)
  createdAt   DateTime  @default(now())
  
  // Relations
  user        User      @relation(fields: [userId], references: [id])
}
```

#### 5. PointHistory (포인트 이력)
```prisma
model PointHistory {
  id          Int       @id @default(autoincrement())
  userId      Int
  points      Int       // 변경된 포인트 (양수/음수)
  reason      String    // 'game_win', 'daily_bonus', 'level_up', etc.
  balance     Int       // 변경 후 잔액
  createdAt   DateTime  @default(now())
  
  // Relations
  user        User      @relation(fields: [userId], references: [id])
}
```

#### 6. LevelConfig (레벨 설정)
```prisma
model LevelConfig {
  level       Int       @id
  expRequired Int       // 다음 레벨까지 필요한 경험치
  rewards     Int       // 레벨업 시 포인트 보상
}
```

#### 7. Alarm (알람)
```prisma
model Alarm {
  id          Int       @id @default(autoincrement())
  roomId      String
  message     String
  cronPattern String    // cron 표현식
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  
  // Relations
  room        Room      @relation(fields: [roomId], references: [roomId])
}
```

#### 8. Command (명령어)
```prisma
model Command {
  id          Int       @id @default(autoincrement())
  command     String    @unique
  description String
  isAdminOnly Boolean   @default(false)
  isActive    Boolean   @default(true)
}
```

## 기능별 상세 설계

### 1. 채팅 순위 시스템

#### 핵심 기능
- **기간별 조회**: 전체, 이번달, 이번주, 저번달, 저번주, 어제, 오늘
- **순위 유형**: 
  - 그룹방 전체 톡수
  - 명령어 사용 순위
  - 개인별 톡수/순위/비율

#### 구현 로직
```typescript
// 기간별 쿼리 생성
function getDateRange(period: string): { start: Date, end: Date } {
  const now = new Date();
  switch(period) {
    case 'today': return { start: startOfDay(now), end: now };
    case 'yesterday': return { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) };
    case 'thisWeek': return { start: startOfWeek(now), end: now };
    case 'lastWeek': return { start: startOfWeek(subWeeks(now, 1)), end: endOfWeek(subWeeks(now, 1)) };
    case 'thisMonth': return { start: startOfMonth(now), end: now };
    case 'lastMonth': return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    case 'all': return { start: new Date(0), end: now };
  }
}

// 채팅 순위 조회
async function getChatRanking(roomId: string, period: string, type: 'all' | 'command') {
  const { start, end } = getDateRange(period);
  
  return prisma.chatActivity.groupBy({
    by: ['userId'],
    where: {
      roomId,
      createdAt: { gte: start, lte: end },
      ...(type === 'command' && { messageType: 'command' })
    },
    _count: { _all: true },
    orderBy: { _count: { _all: 'desc' } }
  });
}
```

#### 응답 포맷
```
📊 채팅 순위 (이번주)
─────────────────
🥇 홍길동: 523회 (31.2%)
🥈 김철수: 412회 (24.6%)
🥉 이영희: 298회 (17.8%)
4. 박민수: 234회 (14.0%)
5. 최지우: 208회 (12.4%)
─────────────────
전체: 1,675회
```

### 2. 경험치/레벨 시스템

#### 경험치 획득 방식
- 일반 메시지: +1 exp
- 명령어 사용: +2 exp
- URL 공유: +5 exp
- 게임 승리: +10 exp
- 일일 출석: +20 exp

#### 레벨 계산식
```typescript
// 레벨별 필요 경험치: 100 * level * (level + 1) / 2
function getExpForLevel(level: number): number {
  return 100 * level * (level + 1) / 2;
}

// 현재 경험치로 레벨 계산
function calculateLevel(totalExp: number): { level: number, currentExp: number, nextLevelExp: number } {
  let level = 1;
  let expForCurrentLevel = 0;
  
  while (totalExp >= getExpForLevel(level)) {
    expForCurrentLevel = getExpForLevel(level);
    level++;
  }
  
  level--;
  const currentExp = totalExp - (level > 1 ? getExpForLevel(level - 1) : 0);
  const nextLevelExp = getExpForLevel(level);
  
  return { level, currentExp, nextLevelExp };
}
```

#### 레벨업 보상
- 레벨 10마다: 보너스 포인트 (level * 100)
- 레벨 50, 100: 특별 칭호

### 3. 포인트 시스템

#### 포인트 획득 방법
- 일일 출석: +100 포인트
- 레벨업: +50 포인트
- 게임 승리: +10~50 포인트
- 특별 이벤트: 관리자 지급

#### 포인트 사용처 (향후 확장)
- 게임 참여비
- 특별 명령어 사용
- 프로필 꾸미기

### 4. 네이버 실시간 뉴스

#### 크롤링 전략
```typescript
// 네이버 뉴스 카테고리
const NEWS_CATEGORIES = {
  '정치': 'politics',
  '경제': 'economy',
  '사회': 'society',
  '생활문화': 'life',
  'IT과학': 'it',
  '세계': 'world',
  '스포츠': 'sports',
  '연예': 'entertain'
};

// 뉴스 크롤링 (Puppeteer 또는 Playwright 사용)
async function fetchNaverNews(category?: string) {
  const results = [];
  
  if (category) {
    // 특정 카테고리
    const news = await crawlCategory(category);
    results.push(...news.slice(0, 5));
  } else {
    // 전체 카테고리별 2개씩
    for (const [name, code] of Object.entries(NEWS_CATEGORIES)) {
      const news = await crawlCategory(code);
      results.push({ category: name, items: news.slice(0, 2) });
    }
  }
  
  return results;
}
```

#### 응답 포맷
```
📰 네이버 실시간 뉴스

【정치】
• 제목1 (5분 전)
• 제목2 (12분 전)

【경제】
• 제목1 (3분 전)
• 제목2 (8분 전)
...
```

### 5. 알람 시스템

#### Cron 기반 스케줄링
```typescript
// NestJS Schedule 모듈 사용
@Cron('0 9 * * *') // 매일 오전 9시
async handleDailyAlarm() {
  const activeAlarms = await prisma.alarm.findMany({
    where: { isActive: true }
  });
  
  for (const alarm of activeAlarms) {
    await sendToKakaoTalk(alarm.roomId, alarm.message);
  }
}
```

#### 알람 관리 명령어
- `!알람추가 [시간] [메시지]`: 새 알람 등록
- `!알람목록`: 현재 등록된 알람 확인
- `!알람삭제 [번호]`: 알람 제거

### 6. 미니 게임

#### 홀짝 게임
```typescript
function playOddEven(userChoice: 'odd' | 'even'): GameResult {
  const dice1 = Math.floor(Math.random() * 6) + 1;
  const dice2 = Math.floor(Math.random() * 6) + 1;
  const dice3 = Math.floor(Math.random() * 6) + 1;
  const total = dice1 + dice2 + dice3;
  
  const result = total % 2 === 0 ? 'even' : 'odd';
  const win = userChoice === result;
  
  return {
    dice: [dice1, dice2, dice3],
    total,
    result,
    win,
    points: win ? 30 : -10
  };
}
```

#### 가위바위보
```typescript
function playRPS(userChoice: 'rock' | 'paper' | 'scissors'): GameResult {
  const choices = ['rock', 'paper', 'scissors'];
  const botChoice = choices[Math.floor(Math.random() * 3)];
  
  const wins = {
    'rock': 'scissors',
    'scissors': 'paper',
    'paper': 'rock'
  };
  
  let result: 'win' | 'lose' | 'draw';
  if (userChoice === botChoice) {
    result = 'draw';
  } else if (wins[userChoice] === botChoice) {
    result = 'win';
  } else {
    result = 'lose';
  }
  
  return {
    userChoice,
    botChoice,
    result,
    points: result === 'win' ? 20 : result === 'draw' ? 0 : -10
  };
}
```

## API 설계

### 기존 엔드포인트
- `POST /chat/process`: 메시지 처리
- `GET /chat/history`: 채팅 기록 조회

### 새로운 엔드포인트

#### 사용자 관리
- `POST /users/register`: 신규 사용자 등록
- `GET /users/:kakaoId`: 사용자 정보 조회
- `PUT /users/:kakaoId/admin`: 관리자 권한 부여

#### 채팅 순위
- `GET /chat/ranking`: 채팅 순위 조회
  - Query: `roomId`, `period`, `type`
- `GET /chat/stats/:roomId`: 방 통계 조회

#### 경험치/레벨
- `POST /exp/add`: 경험치 추가
- `GET /exp/ranking`: 레벨 랭킹 조회

#### 포인트
- `POST /points/add`: 포인트 추가/차감
- `GET /points/ranking`: 포인트 랭킹 조회
- `GET /points/history/:userId`: 포인트 이력 조회

#### 게임
- `POST /game/oddeven`: 홀짝 게임
- `POST /game/rps`: 가위바위보
- `GET /game/history/:userId`: 게임 기록 조회

#### 뉴스
- `GET /news`: 네이버 실시간 뉴스
  - Query: `category`

#### 알람
- `POST /alarm`: 알람 생성
- `GET /alarm/:roomId`: 방별 알람 목록
- `DELETE /alarm/:id`: 알람 삭제

## 보안 및 권한 관리

### 권한 레벨
1. **일반 사용자**: 기본 명령어, 게임, 개인 정보 조회
2. **관리자**: 채팅 순위 조회, 알람 관리, 포인트 지급

### 인증 방식
```typescript
// 간단한 토큰 기반 인증
interface AuthToken {
  userId: number;
  kakaoId: string;
  roomId: string;
  isAdmin: boolean;
  timestamp: number;
}

// 메신저봇R에서 전송 시 토큰 생성
function generateToken(user: User, roomId: string): string {
  const payload: AuthToken = {
    userId: user.id,
    kakaoId: user.kakaoId,
    roomId,
    isAdmin: user.isAdmin,
    timestamp: Date.now()
  };
  
  return encrypt(JSON.stringify(payload), process.env.SECRET_KEY);
}
```

### 관리자 명령어 검증
```typescript
// Guard 구현
@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization;
    
    if (!token) return false;
    
    try {
      const payload = decrypt(token, process.env.SECRET_KEY);
      const authData: AuthToken = JSON.parse(payload);
      
      // 토큰 유효성 검증 (5분)
      if (Date.now() - authData.timestamp > 300000) {
        return false;
      }
      
      return authData.isAdmin;
    } catch {
      return false;
    }
  }
}
```

## 구현 계획

### Phase 1: 기초 인프라 (1주)
1. 데이터베이스 스키마 마이그레이션
2. 기본 모듈 구조 설정
3. 사용자 등록/인증 시스템

### Phase 2: 핵심 기능 (2주)
1. 채팅 활동 추적 시스템
2. 경험치/레벨 시스템
3. 포인트 시스템
4. 채팅 순위 API

### Phase 3: 게임 및 엔터테인먼트 (1주)
1. 홀짝 게임 구현
2. 가위바위보 게임 구현
3. 게임 결과 및 포인트 연동

### Phase 4: 외부 연동 (1주)
1. 네이버 뉴스 크롤러
2. 알람 스케줄러
3. 봇 클라이언트 업데이트

### Phase 5: 최적화 및 테스트 (1주)
1. 성능 최적화
2. 통합 테스트
3. 보안 점검
4. 배포 준비

## 성능 고려사항

### 데이터베이스 인덱싱
```prisma
// 자주 조회되는 필드에 인덱스 추가
@@index([userId, roomId, createdAt]) // 채팅 활동
@@index([roomId, createdAt])          // 방별 조회
@@index([userId, createdAt])          // 사용자별 조회
```

### 캐싱 전략
- Redis 도입 고려
- 순위 데이터: 5분 캐싱
- 사용자 정보: 10분 캐싱
- 뉴스 데이터: 10분 캐싱

### 배치 처리
- 경험치 업데이트: 메시지마다 즉시 처리 대신 배치 처리
- 통계 집계: 매시간 크론잡으로 사전 계산

## 확장 가능성

### 향후 추가 가능 기능
1. **출석 체크 시스템**: 연속 출석 보너스
2. **미션 시스템**: 일일/주간 미션
3. **아이템 상점**: 포인트로 구매 가능한 아이템
4. **길드/팀 시스템**: 그룹 간 경쟁
5. **이벤트 시스템**: 특별 이벤트 기간 보너스
6. **프로필 커스터마이징**: 칭호, 배지 시스템
7. **베팅 시스템**: 포인트 베팅 게임
8. **퀴즈 시스템**: 상식 퀴즈로 포인트 획득

### 모니터링
- 사용자 활동 대시보드
- 실시간 통계 모니터링
- 에러 추적 시스템