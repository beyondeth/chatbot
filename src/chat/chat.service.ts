import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeTranscript } from 'youtube-transcript';
import { Innertube } from 'youtubei.js';

@Injectable()
export class ChatService {
  private genAI: GoogleGenerativeAI;

  constructor(
    private readonly prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.genAI = new GoogleGenerativeAI(this.configService.get<string>('GEMINI_API_KEY') || '');
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
    // URL 확인
    const url = this.extractUrl(message);
    if (url) {
      const summary = await this.generateSummary(url);

      // 요약이 null이면 (실패한 경우) null 반환하여 봇이 반응하지 않도록 함
      if (!summary) {
        return null;
      }

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

    // 키워드 확인
    const keyword = this.extractKeyword(message);
    if (keyword) {
      const summary = await this.searchAndSummarize(keyword);

      if (!summary) {
        return null;
      }

      return this.prisma.chatMessage.create({
        data: {
          roomId,
          message,
          url: null,
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

    // URL도 키워드도 없으면 null 반환
    return null;
  }

  private extractUrl(message: string): string | null {
    // 코드 블록이나 JavaScript 코드가 포함된 메시지는 무시
    if (message.includes('function ') || message.includes('var ') || message.includes('const ')) {
      return null;
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = message.match(urlRegex);
    if (!match) return null;

    const url = match[0];

    // 명확히 지원하지 않는 도메인만 필터링
    const unsupportedDomains = [
      'instagram.com',
      'facebook.com',
      'twitter.com',
      'x.com',
      'tiktok.com',
      'github.com',
      'stackoverflow.com',
      'reddit.com',
      'discord.com',
      'telegram.org',
    ];

    // 지원하지 않는 도메인 체크
    const isUnsupported = unsupportedDomains.some((domain) => url.includes(domain));

    return isUnsupported ? null : url;
  }

  private extractKeyword(message: string): string | null {
    // $키워드 형식 추출
    const keywordRegex = /^\$(.+)$/;
    const match = message.trim().match(keywordRegex);
    return match ? match[1].trim() : null;
  }

  private async generateSummary(url: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
      });

      if (url.includes('youtube.com/watch') || url.includes('youtu.be')) {
        console.log('YouTube URL 처리:', url);

        // YouTube ID 추출
        let videoId = '';
        if (url.includes('youtube.com/watch')) {
          const videoIdMatch = url.match(/[?&]v=([^&]+)/);
          videoId = videoIdMatch ? videoIdMatch[1] : '';
        } else if (url.includes('youtu.be')) {
          const videoIdMatch = url.match(/youtu\.be\/([^?]+)/);
          videoId = videoIdMatch ? videoIdMatch[1] : '';
        }

        if (!videoId) {
          return '유튜브 동영상 ID를 추출할 수 없습니다.';
        }

        // 자막 추출 시도
        let transcript = '';
        let hasTranscript = false;

        // youtubei.js로 먼저 시도
        try {
          console.log('youtubei.js로 자막 추출 시도...');
          const youtube = await Innertube.create();
          const info = await youtube.getInfo(videoId);

          // 자막 가져오기
          const transcriptData = await info.getTranscript();

          if (transcriptData && transcriptData.transcript && transcriptData.transcript.content) {
            const segments = transcriptData.transcript.content.body.initial_segments;
            if (segments && segments.length > 0) {
              transcript = segments.map((segment) => segment.snippet.text).join(' ');
              hasTranscript = true;
              console.log('youtubei.js 자막 추출 성공, 길이:', transcript.length);
            }
          }
        } catch (ytError) {
          console.log('youtubei.js 실패, youtube-transcript로 대체:', ytError.message);

          // youtube-transcript로 대체 시도
          try {
            const transcriptList = await YoutubeTranscript.fetchTranscript(videoId);
            console.log('youtube-transcript items 수:', transcriptList.length);

            if (transcriptList && transcriptList.length > 0) {
              transcript = transcriptList.map((item) => item.text).join(' ');
              hasTranscript = true;
              console.log('youtube-transcript 자막 추출 성공, 길이:', transcript.length);
            }
          } catch (error) {
            console.log('youtube-transcript도 실패:', error.message);
          }
        }

        console.log(
          '자막 체크 - hasTranscript:',
          hasTranscript,
          ', transcript 길이:',
          transcript.length,
        );
        console.log('transcript 타입:', typeof transcript);
        console.log(
          'transcript 내용 첫 100자:',
          transcript ? transcript.substring(0, 100) : 'null or undefined',
        );

        if (hasTranscript && transcript.length > 30) {
          // 자막 기반 정확한 요약
          console.log('자막 길이:', transcript.length);
          console.log('자막 샘플:', transcript.substring(0, 200));

          // 자막이 너무 길면 중간 부분을 주로 사용 (인트로/아웃트로 제외)
          let subtitleForSummary = transcript;
          if (transcript.length > 15000) {
            // 시작 20%, 중간 60%, 끝 20% 비율로 추출
            const start = Math.floor(transcript.length * 0.2);
            const end = Math.floor(transcript.length * 0.8);
            subtitleForSummary = transcript.substring(start, end);
            console.log('긴 자막 - 중간 부분 추출:', start, '~', end);
          }

          const prompt = `
            다음은 유튜브 영상의 자막입니다. 이 자막을 분석하여 영상의 핵심 주제와 내용만을 3문장으로 요약해주세요.
            
            요약 규칙:
            1. 영상의 메인 주제와 직접적으로 관련된 내용만 포함
            2. 광고, 스폰서, 인트로, 아웃트로, 구독 요청 등은 제외
            3. 영상에서 전달하고자 하는 핵심 메시지나 정보만 추출
            4. 각 문장은 <p> 태그로 감싸서 반환
            5. 영어 자막이면 한국어로 번역하여 요약
            6. 화자가 여러 명이면 주요 발언자의 핵심 내용 위주로 요약
            7. 발표자 이름이나 채널명보다는 실제 내용에 집중
            
            자막: ${subtitleForSummary.substring(0, 10000)}
          `;

          try {
            const result = await model.generateContent(prompt);
            const summary = result.response.text();
            console.log('YouTube 요약 성공');
            return summary;
          } catch (error) {
            console.error('Gemini 요약 오류:', error);
            return null;
          }
        } else {
          // 자막을 가져올 수 없는 경우 Gemini API로 직접 시도
          console.log('자막 추출 실패, Gemini API로 직접 시도');

          try {
            const prompt = `
              다음 YouTube 영상 URL의 내용을 분석하고 3문장으로 요약해줘.
              각 문장은 <p> 태그로 감싸서 반환해줘.
              한국어로 요약해줘.
              
              URL: ${url}
            `;

            const result = await model.generateContent(prompt);
            const summary = result.response.text();

            if (summary && summary.length > 20) {
              console.log('Gemini 직접 요약 성공');
              return summary;
            }
          } catch (geminiError) {
            console.log('Gemini 직접 요약도 실패:', geminiError);
          }

          // 모든 방법이 실패하면 null 반환
          return null;
        }
      } else {
        // 일반 웹페이지 처리
        const response = await axios.get<string>(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ko,en;q=0.9',
          },
          timeout: 10000,
        });

        const prompt = `
          아래 웹페이지 내용을 3문장으로 요약해줘.
          각 문장은 <p> 태그로 감싸서 반환해줘.
          기사 내용이 영어라도 반드시 한국어로 요약해줘.
          광고, 메뉴, 네비게이션 등은 제외하고 본문 내용만 요약해줘.
          내용: ${response.data.substring(0, 10000)}
        `;

        const result = await model.generateContent(prompt);
        return result.response.text();
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      // 에러 발생 시 null 반환 (봇이 반응하지 않음)
      return null;
    }
  }

  private async searchAndSummarize(keyword: string): Promise<string | null> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
      });

      // 키워드에 대한 정보를 검색하고 요약
      const prompt = `
        "${keyword}"에 대해 최신 정보를 바탕으로 3문장으로 요약해줘.
        각 문장은 <p> 태그로 감싸서 반환해줘.
        정확하고 유용한 정보를 제공해줘.
        한국어로 답변해줘.
      `;

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Error searching keyword:', error);
      return null;
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
