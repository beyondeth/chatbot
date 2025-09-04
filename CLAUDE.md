# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS-based backend service for a KakaoTalk chatbot that summarizes YouTube videos and news articles. The bot automatically detects URLs in messages and generates AI-powered summaries using Google's Gemini API.

## Key Commands

### Development
```bash
# Install dependencies
npm install

# Run development server with hot reload
npm run start:dev

# Build for production
npm run build

# Run production server
npm run start:prod
```

### Testing
```bash
# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run a single test file
npm run test -- src/chat/chat.service.spec.ts
```

### Code Quality
```bash
# Run ESLint to check code style
npm run lint

# Format code with Prettier
npm run format
```

### Database
```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Open Prisma Studio to browse database
npx prisma studio
```

## Architecture Overview

### Core Structure
- **NestJS Framework**: Modular architecture with dependency injection
- **Database**: PostgreSQL with Prisma ORM for type-safe database access
- **API Integration**: Google Generative AI (Gemini) for content summarization
- **Bot Client**: JavaScript code for KakaoTalk messenger bot (bot.md)

### Key Modules

#### ChatModule (`src/chat/`)
- **ChatController**: HTTP endpoints for bot communication
  - `POST /chat/process`: Processes messages containing URLs
  - `GET /chat/history`: Retrieves chat history by room ID
- **ChatService**: Core business logic
  - URL extraction from messages
  - YouTube transcript fetching with language fallback (ko → en → default)
  - Web page content fetching for news articles
  - AI-powered summarization using Gemini API
  - Database persistence of messages and summaries

#### PrismaModule (`src/prisma/`)
- Provides database connection and ORM functionality
- Central service for all database operations
- Configured as a global module

### External Dependencies
- **@google/generative-ai**: Gemini API integration for AI summarization
- **youtube-transcript**: Fetches YouTube video transcripts
- **axios**: HTTP client for fetching web page content
- **@nestjs/config**: Environment variable management

### Environment Configuration
Required environment variables (.env file):
- `DATABASE_URL`: PostgreSQL connection string
- `GEMINI_API_KEY`: Google Generative AI API key

### Bot Integration
The KakaoTalk bot (bot.md) communicates with this backend via HTTP POST requests to `/chat/process`. The bot:
1. Detects YouTube/news URLs in messages
2. Sends the message to the backend
3. Receives and displays the AI-generated summary

### Database Schema
Single table `ChatMessage` storing:
- Room ID (for multi-room support)
- Original message
- Extracted URL
- Generated summary
- Timestamp