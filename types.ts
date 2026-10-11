
export enum Suit {
  Man = 'm', // Characters
  Pin = 'p', // Dots
  Sou = 's', // Bamboo
  Zihai = 'z', // Honors (Winds/Dragons)
}

export enum GameMode {
  MCR = 'guobiao', // Chinese Official
  Sichuan = 'sichuan', // Sichuan Blood Battle
}

export type Language = 'en' | 'zh';

/**
 * 国标和牌来源：只有在已记录事实时才允许计「不求人 / 门前清 / 自摸」。
 * 输入没有这个事实时必须保持 'unknown'，其结果只报「可确认番 + 待核」。
 */
export type WinSource = 'selfDraw' | 'claim' | 'unknown';

export interface Tile {
  id: string; // Unique ID for React keys
  suit: Suit;
  value: number; // 1-9 for suits, 1-7 for zihai (E, S, W, N, White, Green, Red)
}

export interface Meld {
  id: string;
  type: 'chi' | 'pong' | 'gang';
  tiles: Tile[];
}

export interface FanSuggestion {
  name: string;
  fan: number; // Total estimated fan
  baseFan: number; // Fan of the main pattern
  probability: number; // 0-100
  missingTiles: Tile[]; // Tiles needed to complete this pattern
  patternDetails: string[]; // e.g. ["Mixed Triple Chow (8)", "All Simples (2)"]
  description?: string;
  /** 四川模式用「3 指数番 · 8 倍」这类文本替代「N 番」显示；国标不设置该字段。 */
  scoreText?: string;
}

export type AnalysisStatus = 'invalid' | 'incomplete' | 'notReady' | 'ready' | 'deadWait' | 'completeShapeScoreUnverified';

export interface AnalysisResult {
  status: AnalysisStatus;
  isWinning?: boolean;
  mode?: GameMode;
  scoreNote?: string;
  isReady: boolean; // Ting/Tenpai
  shanten: number | null; // null = invalid/incomplete input; 0 = structurally ready
  waitingTiles: {
    tile: Tile;
    remaining: number;
    probability: string;
  }[];
  bestDiscard?: {
    tile: Tile;
    reason: string;
    ukeire: number; // 进张数 (有效牌的数量)
    ukeireTiles: number; // 进张种类数 (有效牌的种类数量)
  };
  suggestions: FanSuggestion[];
  scoreEstimate?: number; // Fan
  warnings: string[];
}

export interface GameState {
  mode: GameMode | null;
  wallCount: number;
  voidSuit: Suit | null; // For Sichuan
  hand: Tile[];
  melds: Meld[];
  discards: Tile[];
  /** 国标和牌来源；未记录时视为 'unknown'，不得据此计自摸/不求人/门前清。 */
  winSource?: WinSource;
}
