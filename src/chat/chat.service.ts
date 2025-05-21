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

        // 2. YouTube Data API로 동영상 정보 가져오기
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
          return 'YouTube API 키가 설정되지 않았습니다.';
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

        if (!res.data.items || res.data.items.length === 0) {
          return '유튜브 동영상 정보를 찾을 수 없습니다.';
        }

        const video = res.data.items[0];
        const snippet = video.snippet;
        const stats = video.statistics;

        // 3. 자막 가져오기
        let transcript = '';
        try {
          const transcriptItems =
            await YoutubeTranscript.fetchTranscript(videoId);
          transcript = transcriptItems.map((item) => item.text).join(' ');
        } catch (e) {
          console.error('자막 가져오기 실패:', e);
        }

        // 4. Gemini에 전달할 내용 구성
        const content = {
          title: snippet.title,
          channel: snippet.channelTitle,
          uploadDate: new Date(snippet.publishedAt).toLocaleDateString(),
          views: parseInt(stats.viewCount).toLocaleString(),
          likes: parseInt(stats.likeCount).toLocaleString(),
          description: snippet.description,
          transcript: transcript,
        };

        const model = this.genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
        });

        const prompt = `
          아래 유튜브 동영상 정보를 바탕으로 3문장으로 요약해줘.
          각 문장은 <p> 태그로 감싸서 반환해줘.
          반드시 한국어로 요약해줘.
          
          제목: ${content.title}
          채널: ${content.channel}
          업로드일: ${content.uploadDate}
          조회수: ${content.views}회
          좋아요: ${content.likes}개
          설명: ${content.description}
          ${content.transcript ? `자막: ${content.transcript}` : ''}
        `;

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
