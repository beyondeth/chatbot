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
      let content = '';

      if (url.includes('youtube.com/watch')) {
        // YouTube 링크면 Data API로 제목/설명 추출
        const videoIdMatch = url.match(/[?&]v=([^&]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : '';

        if (!videoId) {
          return '유튜브 동영상 ID를 추출할 수 없습니다.';
        }

        // 1. 자막 가져오기
        let transcript = '';
        try {
          const transcriptItems =
            await YoutubeTranscript.fetchTranscript(videoId);
          transcript = transcriptItems.map((item) => item.text).join(' ');
        } catch (e) {
          console.error('자막 가져오기 실패:', e);
          // 자막이 없어도 계속 진행
        }

        // 2. 메타데이터 가져오기
        try {
          const apiKey = process.env.YOUTUBE_API_KEY;
          if (!apiKey) {
            throw new Error('YouTube API 키가 설정되지 않았습니다.');
          }

          const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`;
          const res = await axios.get<{
            items: {
              snippet: {
                title: string;
                description: string;
                channelTitle: string;
                publishedAt: string;
              };
              statistics: {
                viewCount: string;
                likeCount: string;
              };
            }[];
          }>(apiUrl);

          const items = res.data?.items;
          if (!items || items.length === 0) {
            return '유튜브 동영상 정보를 찾을 수 없습니다.';
          }

          const snippet = items[0].snippet;
          const stats = items[0].statistics;

          // 3. 모든 정보 조합
          content = `
            제목: ${snippet.title}
            채널: ${snippet.channelTitle}
            업로드: ${new Date(snippet.publishedAt).toLocaleDateString()}
            조회수: ${parseInt(stats.viewCount).toLocaleString()}회
            좋아요: ${parseInt(stats.likeCount).toLocaleString()}개
            설명: ${snippet.description}
            ${transcript ? `자막: ${transcript}` : ''}
          `
            .replace(/\s+/g, ' ')
            .trim();
        } catch (e) {
          console.error('YouTube API 호출 실패:', e);
          return 'YouTube API 호출 중 오류가 발생했습니다.';
        }
      } else {
        // 일반 뉴스/블로그 등은 axios로 HTML 추출
        try {
          const response = await axios.get<string>(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'ko,en;q=0.9',
            },
            timeout: 10000, // 10초 타임아웃
          });
          content = response.data;
        } catch (e) {
          console.error('웹페이지 가져오기 실패:', e);
          return '웹페이지를 가져오는 중 오류가 발생했습니다.';
        }
      }

      if (!content) {
        return '요약할 내용을 찾을 수 없습니다.';
      }

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
      });

      const prompt = `
        아래 내용을 3문장으로 요약해줘.
        각 문장은 <p> 태그로 감싸서 반환해줘.
        기사 내용이 영어라도 반드시 한국어로 요약해줘.
        내용: ${content}
      `;

      const result = await model.generateContent(prompt);
      return result.response.text();
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
