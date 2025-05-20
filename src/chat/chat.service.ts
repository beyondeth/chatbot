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
      const response = await axios.get<string>(url);
      const html: string = response.data;
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

      const prompt = `Please analyze this webpage content and provide a concise summary in 3 paragraphs. Focus on the main points and key information. Here's the content: ${html}`;

      const result = await model.generateContent(prompt);
      const response2 = result.response;
      return response2.text();
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

  private async callGeminiAPI(prompt: string): Promise<string> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const genAI = new GoogleGenerativeAI(apiKey || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  async testGemini() {
    const prompt =
      '이 문장을 3문장으로 요약해줘. <p>태그로 감싸서 반환해줘. 인공지능은 미래 사회에 어떤 영향을 미칠까?';
    return await this.callGeminiAPI(prompt);
  }

  async testGeminiWithUrl() {
    // 테스트용 샘플 URL (요약이 잘 되는 뉴스 기사 등으로 교체 가능)

    const url =
      'https://www.chosun.com/national/court_law/2025/05/20/SPXYBPHYIVF23NDK62H6CVORSU/';
    try {
      const response = await axios.get<string>(url);
      const html: string = response.data;
      const prompt = `<웹페이지 내용 요약>\n아래 웹페이지 내용을 3문단으로 요약해줘. <p> 태그로 감싸서 반환해줘.\n${html}`;
      return await this.callGeminiAPI(prompt);
    } catch (error) {
      return 'URL 요약 테스트 중 오류 발생: ' + error;
    }
  }
}
