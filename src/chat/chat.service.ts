import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeTranscript } from 'youtube-transcript';

@Injectable()
export class ChatService {
  private genAI: GoogleGenerativeAI;

  constructor(
    private readonly prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.genAI = new GoogleGenerativeAI(
      this.configService.get<string>('GEMINI_API_KEY') || '',
    );
  }

  async processMessage(
    roomId: string,
    message: string,
  ): Promise<{
    id: number;
    roomId: string;
    message: string;
    url: string | null;
    summary: string | null;
    createdAt: Date;
  } | null> {
    const url = this.extractUrl(message);
    if (!url) {
      return null;
    }

    const summary = await this.generateSummary(url);

    return this.prisma.chatMessage.create({
      data: {
        roomId,
        message,
        url,
        summary,
      },
    }) as Promise<{
      id: number;
      roomId: string;
      message: string;
      url: string | null;
      summary: string | null;
      createdAt: Date;
    }>;
  }

  private extractUrl(message: string): string | null {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = message.match(urlRegex);
    return match ? match[0] : null;
  }

  private async generateSummary(url: string): Promise<string> {
    try {
      if (url.includes('youtube.com/watch')) {
        // 1. YouTube 동영상 ID 추출
        const videoIdMatch = url.match(/[?&]v=([^&]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : '';

        if (!videoId) {
          return '유튜브 동영상 ID를 추출할 수 없습니다.';
        }

        // 2. 자막 추출 (한국어 → 영어 → 기본)
        let transcript = '';
        // 2-1. 한국어 자막 시도
        try {
          const items = await YoutubeTranscript.fetchTranscript(videoId, {
            lang: 'ko',
          });
          transcript = items.map((item) => item.text).join(' ');
        } catch {
          /* empty */
        }
        // 2-2. 영어 자막 시도 (없으면)
        if (!transcript) {
          try {
            const items = await YoutubeTranscript.fetchTranscript(videoId, {
              lang: 'en',
            });
            transcript = items.map((item) => item.text).join(' ');
          } catch {
            /* empty */
          }
        }
        // 2-3. 기본(언어 미지정) 시도 (없으면)
        if (!transcript) {
          try {
            const items = await YoutubeTranscript.fetchTranscript(videoId);
            transcript = items.map((item) => item.text).join(' ');
          } catch {
            /* empty */
          }
        }

        // 전처리: 안내문/불필요한 줄 제거
        transcript = transcript
          .split('\n')
          .map((line) => line.trim())
          .filter(
            (line) =>
              line.length > 0 &&
              !line.includes('로그인이 필요') &&
              !line.includes('추천 동영상') &&
              !line.includes('YouTube 웹페이지') &&
              !line.includes('재생목록') &&
              !line.includes('공유') &&
              !line.includes('댓글') &&
              !line.includes('업로더') &&
              !line.includes('조회수') &&
              !line.includes('길이'),
          )
          .join(' ');

        if (!transcript || transcript.length < 30) {
          return '유튜브 자막이 존재하지 않습니다.';
        }

        // 3. Gemini에 자막 전달 (영어면 한국어로 번역해서 요약하도록 프롬프트)
        const model = this.genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
        });

        const prompt = `
        유튜브 자막 : ${transcript} 자막 안에 있는 내용으로만 3문장으로 요약하고 각 문장은 <p> 태그로 감싸서 반환해줘.
        <p> 태그 문장안에는 로그인 안내, 추천 영상, HTML, 안내문 등 절대 포함하지 마. 만약 자막이 없다면 영상 제목과 간단한 내용 한줄로 요약해서 줘.`;

        const result = await model.generateContent(prompt);
        return result.response.text();
      } else {
        // 일반 웹페이지 처리
        const response = await axios.get<string>(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ko,en;q=0.9',
          },
        });

        const model = this.genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
        });

        const prompt = `
          아래 웹페이지 내용을 3문장으로 요약해줘.
          각 문장은 <p> 태그로 감싸서 반환해줘.
          기사 내용이 영어라도 반드시 한국어로 요약해줘.
          내용: ${response.data}
        `;

        const result = await model.generateContent(prompt);
        return result.response.text();
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      return '요약 생성 중 오류가 발생했습니다.';
    }
  }

  async getHistory(roomId: string) {
    return this.prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        message: true,
        url: true,
        summary: true,
        createdAt: true,
      },
    });
  }
}
