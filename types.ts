
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

/** 川麻独立的和牌事件。普通和牌不加事件番，特殊事件按当前四川牌桌口径各 +1。 */
export type SichuanWinEvent = 'ordinary' | 'kongBloom' | 'kongDiscard' | 'robbingKong' | 'lastDraw' | 'lastDiscard';

/** 门风/圈风：1 东、2 南、3 西、4 北（与牌值一致）。 */
export type Wind = 1 | 2 | 3 | 4;

/** 杠的真实类型：明杠、暗杠、补杠（加杠）。未记录时不得计明杠/暗杠/双明杠/双暗杠。 */
export type KongKind = 'exposed' | 'concealed' | 'added';

export interface Tile {
  id: string; // Unique ID for React keys
  suit: Suit;
  value: number; // 1-9 for suits, 1-7 for zihai (E, S, W, N, White, Green, Red)
}

export interface Meld {
  id: string;
  type: 'chi' | 'pong' | 'gang';
  tiles: Tile[];
  /** 仅 type === 'gang' 有意义；缺省表示未记录，按未知处理。 */
  kongKind?: KongKind;
}

/**
 * 国标计番需要的已记录事实。缺省字段表示用户没有记录，计番时不得推断。
 */
export interface MCRContext {
  /** 和牌张（手上第 14 张）。用于边张/坎张/单钓将、和绝张与九莲宝灯。 */
  winningTile?: Tile | null;
  /** 门风。 */
  seatWind?: Wind | null;
  /** 圈风。 */
  roundWind?: Wind | null;
  /** 是否和牌墙上最后一张牌：自摸记妙手回春，点和记海底捞月。 */
  lastTile?: boolean | null;
  /** 是否杠后和牌：自摸记杠上开花，点和加杠的牌记抢杠和。 */
  afterKong?: boolean | null;
  /** 已记录的牌河，用于核对和绝张（已见三张的第四张）。 */
  discards?: Tile[];
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
  /** 成牌但仍有未记录的事件事实（国标）；此时番数只能标「待核」，否则标「参考计番」。 */
  contextPending?: boolean;
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
  /** 四川血战和牌事件；未记录时不计事件番，不能用国标 afterKong 推断。 */
  sichuanWinEvent?: SichuanWinEvent | null;
  /** 国标和牌张；未记录时不计边张/坎张/单钓将，也不确认九莲宝灯。 */
  winningTile?: Tile | null;
  /** 国标门风；未记录时不计门风刻。 */
  seatWind?: Wind | null;
  /** 国标圈风；未记录时不计圈风刻。 */
  roundWind?: Wind | null;
  /** 国标是否牌墙最后一张牌（自摸=妙手回春，点和=海底捞月）；未记录不计。 */
  lastTile?: boolean | null;
  /** 国标是否杠后和牌（自摸=杠上开花，点和加杠的牌=抢杠和）；未记录不计。 */
  afterKong?: boolean | null;
}
