export enum RpsChoice {
  ROCK = 'rock',
  PAPER = 'paper',
  SCISSORS = 'scissors',
}

export enum RpsResult {
  WIN = 'win',
  LOSE = 'lose',
  DRAW = 'draw',
}

export enum GameType {
  RPS = 'rps',
  ODDEVEN = 'oddeven',
}

// 한글 매핑
export const RpsChoiceKorean = {
  [RpsChoice.ROCK]: '바위',
  [RpsChoice.PAPER]: '보',
  [RpsChoice.SCISSORS]: '가위',
};

export const RpsEmoji = {
  [RpsChoice.ROCK]: '✊',
  [RpsChoice.PAPER]: '✋',
  [RpsChoice.SCISSORS]: '✂️',
};
