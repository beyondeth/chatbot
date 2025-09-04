```javascript
const scriptName = "링크요약봇";

// 서버 URL 설정 (실제 서버 주소로 변경 필요)
const SERVER_URL = "http://localhost:3000"; // 또는 실제 배포된 서버 주소

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    try {
        // URL이 포함된 메시지인지 확인
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = msg.match(urlRegex);
        
        if (!urls) {
            return; // URL이 없으면 반응하지 않음
        }
        
        // 유튜브 또는 뉴스 링크인지 확인
        const targetUrl = urls[0];
        const isYoutube = targetUrl.includes('youtube.com/watch') || targetUrl.includes('youtu.be/');
        const isNews = targetUrl.includes('news') || 
                      targetUrl.includes('naver.com') || 
                      targetUrl.includes('daum.net') || 
                      targetUrl.includes('chosun.com') || 
                      targetUrl.includes('joongang.co.kr') || 
                      targetUrl.includes('donga.com') ||
                      targetUrl.includes('hani.co.kr') ||
                      targetUrl.includes('khan.co.kr') ||
                      targetUrl.includes('mt.co.kr') ||
                      targetUrl.includes('mk.co.kr');
        
        if (!isYoutube && !isNews) {
            return; // 유튜브나 뉴스 링크가 아니면 반응하지 않음
        }
        
        // 로딩 메시지 전송
        replier.reply("🔄 링크를 분석하고 요약 중입니다...");
        
        // 서버에 요약 요청
        const requestData = {
            roomId: room,
            message: msg
        };
        
        const response = org.jsoup.Jsoup.connect(SERVER_URL + "/chat/process")
            .method(org.jsoup.Connection.Method.POST)
            .header("Content-Type", "application/json")
            .requestBody(JSON.stringify(requestData))
            .ignoreContentType(true)
            .execute();
            
        const responseBody = response.body();
        const result = JSON.parse(responseBody);
        
        if (result.summary && result.summary !== "요약 생성에 실패했습니다.") {
            // 성공적으로 요약된 경우
            let summaryText = result.summary;
            
            // HTML 태그 제거 및 정리
            summaryText = summaryText.replace(/<p>/g, "• ");
            summaryText = summaryText.replace(/<\/p>/g, "\n");
            summaryText = summaryText.replace(/<[^>]*>/g, ""); // 나머지 HTML 태그 제거
            summaryText = summaryText.replace(/\n\s*\n/g, "\n"); // 빈 줄 정리
            
            const icon = isYoutube ? "🎥" : "📰";
            const type = isYoutube ? "유튜브" : "뉴스";
            
            const finalMessage = `${icon} ${type} 요약\n\n${summaryText.trim()}`;
            replier.reply(finalMessage);
        } else {
            // 요약 실패한 경우
            replier.reply("❌ 요약 생성에 실패했습니다. 링크를 확인해주세요.");
        }
        
    } catch (error) {
        // 에러 발생 시
        replier.reply("⚠️ 오류가 발생했습니다: " + error.message);
        Log.e("링크요약봇 오류: " + error.toString());
    }
}

// 봇이 시작될 때 실행
function onCreate(savedInstanceState, activity) {
    Log.i("링크요약봇이 시작되었습니다.");
}

// 봇이 종료될 때 실행  
function onDestroy() {
    Log.i("링크요약봇이 종료되었습니다.");
}
```

## 사용 방법

1. **서버 실행**: 먼저 NestJS 서버를 실행하세요
   ```bash
   npm run start:dev
   ```

2. **서버 URL 수정**: bot.md 파일의 `SERVER_URL`을 실제 서버 주소로 변경하세요
   - 로컬 테스트: `http://localhost:3000`
   - 배포된 서버: 실제 도메인 주소

3. **메신저봇R 설정**:
   - 메신저봇R 앱에서 새 봇 생성
   - 위 코드를 복사해서 붙여넣기
   - 봇 활성화

4. **테스트**:
   - 카카오톡 방에 유튜브 링크나 뉴스 링크 전송
   - 봇이 자동으로 요약해서 답장

## 주요 기능

- ✅ 유튜브 링크 자동 감지 및 자막 기반 요약
- ✅ 뉴스 기사 링크 자동 감지 및 내용 요약  
- ✅ HTML 태그 제거 및 깔끔한 포맷팅
- ✅ 에러 처리 및 로딩 메시지
- ✅ 방별 채팅 기록 저장

## 추가 개선 사항

필요하시면 다음 기능들도 추가할 수 있습니다:
- 특정 키워드로 봇 호출 (`!요약` 등)
- 요약 길이 조절 옵션
- 더 많은 뉴스 사이트 지원
- 요약 기록 조회 기능
