const scriptName = "향상된봇v2";

// 설정
const BotConfig = {
  // Bore.pub HTTP 터널 (메신저봇R에서 잘 작동)
  SERVER_URL: "http://bore.pub:26262",
  // Serveo 터널 URL (HTTPS, 인증서 문제로 메신저봇R에서 안됨)
  // SERVER_URL: "https://019e9952d3add9592783d7ab53dc223f.serveo.net",
  // 같은 와이파이에 있을 때 사용 (로컬 네트워크)
  // SERVER_URL: "http://192.168.123.138:3001",
  DEBUG_MODE: true,
  RESPONSE_TIMEOUT: 30000, // 30초로 증가
};

// 유틸리티 함수들
const BotUtils = {
  log: function(message) {
    if (BotConfig.DEBUG_MODE) {
      Log.d("[" + scriptName + "] " + message);
    }
  },

  error: function(message, error) {
    Log.e("[" + scriptName + "] " + message);
    if (error) {
      Log.e(error.toString());
    }
  },

  parseCommand: function(message) {
    const parts = message.trim().split(/\s+/);
    return {
      command: parts[0],
      args: parts.slice(1),
      fullText: message
    };
  }
};

// API 통신 모듈
const BotAPI = {
  call: function(endpoint, method, data) {
    try {
      BotUtils.log("API Call: " + method + " " + endpoint);

      const url = BotConfig.SERVER_URL + endpoint;
      let response;

      if (method === "GET") {
        response = org.jsoup.Jsoup.connect(url)

          .method(org.jsoup.Connection.Method.GET)
          .ignoreContentType(true)
          .timeout(BotConfig.RESPONSE_TIMEOUT)
          .execute();
      } else {
        response = org.jsoup.Jsoup.connect(url)
          .method(org.jsoup.Connection.Method[method])
          .header("Content-Type", "application/json")
          .requestBody(JSON.stringify(data))
          .ignoreContentType(true)
          .timeout(BotConfig.RESPONSE_TIMEOUT)
          .execute();
      }

      const result = JSON.parse(response.body());
      BotUtils.log("API Response: " + JSON.stringify(result));
      return result;

    } catch (error) {
      BotUtils.error("API Error: " + endpoint, error);
      throw error;
    }
  },

  post: function(endpoint, data) {
    return this.call(endpoint, "POST", data);
  },

  get: function(endpoint) {
    return this.call(endpoint, "GET", null);
  }
};

// 명령어 모듈들
const BotCommands = {};

// 가위바위보 명령어
BotCommands.rps = {
  pattern: /^!가위바위보\s+(가위|바위|보)$/,

  execute: function(room, msg, sender, replier) {
    const match = msg.match(this.pattern);
    if (!match) {
      replier.reply("❌ 사용법: !가위바위보 [가위/바위/보]");
      return;
    }

    const choice = match[1];
    const choiceMap = {
      '가위': 'scissors',
      '바위': 'rock',
      '보': 'paper'
    };

    try {
      const response = BotAPI.post("/game/rps", {
        sender: sender,
        roomId: room,
        choice: choiceMap[choice]
      });

      replier.reply(this.formatResponse(response, sender));

    } catch (error) {
      replier.reply("❌ 게임 진행 중 오류가 발생했습니다.");
    }
  },

  formatResponse: function(result, sender) {
    const emojiMap = {
      'scissors': '✂️',
      'rock': '✊',
      'paper': '✋'
    };

    const choiceKorean = {
      'scissors': '가위',
      'rock': '바위',
      'paper': '보'
    };

    const resultMessage = {
      'win': '🎉 승리!',
      'lose': '😢 패배!',
      'draw': '🤝 무승부!'
    };

    let message = "🎮 가위바위보!\n";
    message += "━━━━━━━━━━━━━\n";
    message += "👤 " + sender + "\n";
    message += "당신: " + emojiMap[result.userChoice] + " " + choiceKorean[result.userChoice] + "\n";
    message += "봇: " + emojiMap[result.botChoice] + " " + choiceKorean[result.botChoice] + "\n\n";
    message += resultMessage[result.result];

    if (result.points !== 0) {
      message += " " + (result.points > 0 ? "+" : "") + result.points + " 포인트";
    }

    if (result.streak && result.streak >= 3) {
      message += "\n🔥 " + result.streak + "연승 중!";
    }

    if (result.eventMessage) {
      message += "\n\n" + result.eventMessage;
    }

    return message;
  }
};

// $키워드 검색 명령어
BotCommands.keywordSearch = {
  pattern: /^\$(.+)$/,

  canHandle: function(msg) {
    return this.pattern.test(msg.trim());
  },

  execute: function(room, msg, sender, replier) {
    const match = msg.trim().match(this.pattern);
    if (!match) return;

    const keyword = match[1].trim();
    replier.reply("🔍 \"" + keyword + "\"에 대해 검색 중...");

    try {
      const response = BotAPI.post("/chat/process", {
        roomId: room,
        message: msg
      });

      if (response.summary) {
        replier.reply(this.formatResponse(response.summary, keyword));
      } else {
        replier.reply("❌ 검색 결과를 찾을 수 없습니다.");
      }
    } catch (error) {
      replier.reply("⚠️ 검색 중 오류가 발생했습니다.");
    }
  },

  formatResponse: function(summary, keyword) {
    let text = summary;
    text = text.replace(/<p>/g, "• ");
    text = text.replace(/<\/p>/g, "\n");
    text = text.replace(/<[^>]*>/g, "");
    text = text.replace(/\n\s*\n/g, "\n");

    return "💡 " + keyword + " 검색 결과\n\n" + text.trim();
  }
};

// URL 요약 명령어 (기존 기능)
BotCommands.urlSummary = {
  urlPattern: /(https?:\/\/[^\s]+)/g,

  canHandle: function(msg) {
    const urls = msg.match(this.urlPattern);
    if (!urls) return false;

    const url = urls[0];
    const isYoutube = url.includes('youtube.com/watch') || url.includes('youtu.be/');
    const isNews = url.includes('news') ||
                  url.includes('naver.com') ||
                  url.includes('daum.net') ||
                  url.includes('chosun.com') ||
                  url.includes('joongang.co.kr');

    return isYoutube || isNews;
  },

  execute: function(room, msg, sender, replier) {
    const urls = msg.match(this.urlPattern);

    replier.reply("🔄 링크를 분석하고 요약 중입니다...");

    try {
      const response = BotAPI.post("/chat/process", {
        roomId: room,
        message: msg
      });

      BotUtils.log("URL 요약 응답: " + JSON.stringify(response));

      if (response && response.summary) {
        replier.reply(this.formatSummary(response.summary, urls[0]));
      } else {
        replier.reply("❌ 요약 생성에 실패했습니다.");
      }
    } catch (error) {
      BotUtils.error("URL 요약 오류", error);
      replier.reply("⚠️ 오류가 발생했습니다: " + error.message);
    }
  },

  formatSummary: function(summary, url) {
    const isYoutube = url.includes('youtube') || url.includes('youtu.be');
    const icon = isYoutube ? "🎥" : "📰";
    const type = isYoutube ? "유튜브" : "뉴스";

    let text = summary;
    text = text.replace(/<p>/g, "• ");
    text = text.replace(/<\/p>/g, "\n");
    text = text.replace(/<[^>]*>/g, "");
    text = text.replace(/\n\s*\n/g, "\n");

    return icon + " " + type + " 요약\n\n" + text.trim();
  }
};

// 도움말 명령어
BotCommands.help = {
  pattern: /^(!도움말|!help|!명령어)$/,

  execute: function(room, msg, sender, replier) {
    const helpText =
      "📚 명령어 도움말\n" +
      "━━━━━━━━━━━━━\n" +
      "🎮 게임\n" +
      "• !가위바위보 [가위/바위/보]\n\n" +
      "👤 사용자\n" +
      "• !내정보 - 내 레벨/포인트 확인\n" +
      "• !랭킹 - 레벨 랭킹 TOP 10\n" +
      "• !포인트랭킹 - 포인트 랭킹 TOP 10\n\n" +
      "🔍 검색\n" +
      "• $키워드 - AI 검색 (예: $날씨)\n\n" +
      "📄 기타\n" +
      "• URL 자동 요약 (유튜브/뉴스)\n" +
      "• !도움말 - 이 메시지\n\n" +
      "🆕 더 많은 기능이 추가될 예정입니다!";

    replier.reply(helpText);
  }
};

// 내정보 명령어
BotCommands.myInfo = {
  pattern: /^!내정보$/,

  execute: function(room, msg, sender, replier) {
    try {
      const response = BotAPI.get("/user/" + encodeURIComponent(sender));

      if (!response.success) {
        replier.reply("❌ 사용자 정보를 찾을 수 없습니다.\n게임을 한 번이라도 플레이해주세요!");
        return;
      }

      const user = response.user;
      let message = "👤 " + user.nickname + "님의 정보\n";
      message += "━━━━━━━━━━━━━\n";
      message += "📊 레벨: Lv." + user.level + "\n";
      message += "⭐ 경험치: " + user.experience + " XP\n";
      message += "💰 포인트: " + user.points + " P\n";

      if (user.isAdmin) {
        message += "👑 관리자\n";
      }

      replier.reply(message);

    } catch (error) {
      replier.reply("❌ 정보 조회 중 오류가 발생했습니다.");
    }
  }
};

// 레벨 랭킹 명령어
BotCommands.levelRanking = {
  pattern: /^!랭킹$/,

  execute: function(room, msg, sender, replier) {
    try {
      const response = BotAPI.get("/user/rankings/level?limit=10");

      if (!response.success || response.rankings.length === 0) {
        replier.reply("❌ 랭킹 정보가 없습니다.");
        return;
      }

      let message = "🏆 레벨 랭킹 TOP 10\n";
      message += "━━━━━━━━━━━━━\n";

      response.rankings.forEach(function(user) {
        const medal = user.rank === 1 ? "🥇" : user.rank === 2 ? "🥈" : user.rank === 3 ? "🥉" : user.rank + ".";
        message += medal + " " + user.nickname + " (Lv." + user.level + ")\n";
      });

      replier.reply(message);

    } catch (error) {
      replier.reply("❌ 랭킹 조회 중 오류가 발생했습니다.");
    }
  }
};

// 포인트 랭킹 명령어
BotCommands.pointRanking = {
  pattern: /^!포인트랭킹$/,

  execute: function(room, msg, sender, replier) {
    try {
      const response = BotAPI.get("/user/rankings/points?limit=10");

      if (!response.success || response.rankings.length === 0) {
        replier.reply("❌ 랭킹 정보가 없습니다.");
        return;
      }

      let message = "💎 포인트 랭킹 TOP 10\n";
      message += "━━━━━━━━━━━━━\n";

      response.rankings.forEach(function(user) {
        const medal = user.rank === 1 ? "🥇" : user.rank === 2 ? "🥈" : user.rank === 3 ? "🥉" : user.rank + ".";
        message += medal + " " + user.nickname + " (" + user.points + "P)\n";
      });

      replier.reply(message);

    } catch (error) {
      replier.reply("❌ 랭킹 조회 중 오류가 발생했습니다.");
    }
  }
};

// 테스트 명령어
BotCommands.test = {
  pattern: /^!테스트$/,

  execute: function(room, msg, sender, replier) {
    try {
      BotAPI.get("/");
      replier.reply("✅ 서버 연결 성공!");
    } catch (error) {
      replier.reply("❌ 서버 연결 실패: " + error.message);
    }
  }
};

// 메인 응답 함수
function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  try {
    BotUtils.log("Message received: " + msg + " from " + sender + " in " + room);
    BotUtils.log("isGroupChat: " + isGroupChat + ", packageName: " + packageName);

    // $키워드 검색 체크
    if (BotCommands.keywordSearch.canHandle(msg)) {
      BotCommands.keywordSearch.execute(room, msg, sender, replier);
      return;
    }

    // URL 요약 체크
    if (BotCommands.urlSummary.canHandle(msg)) {
      BotCommands.urlSummary.execute(room, msg, sender, replier);
      return;
    }

    // 명령어 체크
    const parsed = BotUtils.parseCommand(msg);

    // 가위바위보
    if (BotCommands.rps.pattern.test(msg)) {
      BotCommands.rps.execute(room, msg, sender, replier);
      return;
    }

    // 내정보
    if (BotCommands.myInfo.pattern.test(msg)) {
      BotCommands.myInfo.execute(room, msg, sender, replier);
      return;
    }

    // 레벨 랭킹
    if (BotCommands.levelRanking.pattern.test(msg)) {
      BotCommands.levelRanking.execute(room, msg, sender, replier);
      return;
    }

    // 포인트 랭킹
    if (BotCommands.pointRanking.pattern.test(msg)) {
      BotCommands.pointRanking.execute(room, msg, sender, replier);
      return;
    }

    // 도움말
    if (BotCommands.help.pattern.test(msg)) {
      BotCommands.help.execute(room, msg, sender, replier);
      return;
    }

    // 테스트
    if (BotCommands.test.pattern.test(msg)) {
      BotCommands.test.execute(room, msg, sender, replier);
      return;
    }

  } catch (error) {
    BotUtils.error("Response error", error);
    replier.reply("⚠️ 오류가 발생했습니다.");
  }
}

// 봇 시작
function onCreate(savedInstanceState, activity) {
  BotUtils.log("Bot started");
}

// 봇 종료
function onDestroy() {
  BotUtils.log("Bot stopped");
}
