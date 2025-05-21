import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

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
      let html = '';
      if (url.includes('youtube.com/watch')) {
        // YouTube 링크면 Data API로 제목/설명 추출
        const videoIdMatch = url.match(/[?&]v=([^&]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : '';
        if (videoId) {
          const apiKey = process.env.YOUTUBE_API_KEY;
          const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
          const res = await axios.get<{
            items: { snippet: { title: string; description: string } }[];
          }>(apiUrl);
          const items = res.data?.items;
          if (items && items.length > 0) {
            const snippet = items[0].snippet;
            html = `제목: ${snippet.title}\n설명: ${snippet.description}`;
          } else {
            html = '유튜브 동영상 정보를 찾을 수 없습니다.';
          }
        } else {
          html = '유튜브 동영상 ID를 추출할 수 없습니다.';
        }
      } else {
        // 일반 뉴스/블로그 등은 axios로 HTML 추출
        const response = await axios.get<string>(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ko,en;q=0.9',
          },
        });
        html = response.data;
      }

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
      });

      const prompt = `
        아래 내용을 3문장으로 요약해줘.
        각 문장은 <p> 태그로 감싸서 반환해줘.
        기사 내용이 영어라도 반드시 한국어로 요약해줘.
        내용: ${html}
      `;

      const result = await model.generateContent(prompt);
      let summary = result.response.text();
      // YouTube 링크인 경우 특별한 마커 추가
      if (url.includes('youtube.com/watch')) {
        summary = '🎥 ' + summary; // YouTube 마커 추가
      }
      return summary;
    } catch (error) {
      console.error('Error generating summary:', error);
      return 'Failed to generate summary';
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
