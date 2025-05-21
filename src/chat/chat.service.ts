import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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
        // YouTube 링크면 Selenium으로 설명 추출
        html = await getYoutubeDescription(url);
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
      return result.response.text();
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

async function getYoutubeDescription(url: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('./venv/bin/python', [
      'selenium_youtube_desc.py',
      url,
    ]);
    return stdout.trim();
  } catch (error) {
    console.error('Selenium 오류:', error);
    return '';
  }
}
