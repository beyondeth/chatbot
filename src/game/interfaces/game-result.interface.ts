import { RpsChoice, RpsResult } from '../enums/game.enum';

export interface RpsGameResult {
  userChoice: RpsChoice;
  botChoice: RpsChoice;
  result: RpsResult;
  points: number;
  message?: string;
  streak?: number;
  eventMessage?: string;
}

export interface GameStats {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
}
