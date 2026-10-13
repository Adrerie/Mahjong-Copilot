import { GameMode, GameState, KongKind, Meld, SichuanWinEvent, Suit, Tile, WinSource, Wind } from '../types';
import { INITIAL_WALL_MCR, INITIAL_WALL_SICHUAN, MAX_TILES_IN_HAND, SUIT_LABELS, createTile, getTileKey } from '../constants';
import { countTiles } from './tileHelpers';
import { isSichuanWinEvent, isTile, validateGameState, winningTileInHand } from './inputValidation';

/**
 * 录入层的纯函数，供 InputScreen 与 npm test 共用：
 * - parseTileText：牌串 → 暗手牌张（语法与单串内牌值/张数检查）
 * - planTextHand / planTileAdd：候选局面 → 校验通过才返回新局面，失败只返回原因
 * - encodeEntryState / decodeEntryState：按玩法存取的局面编解码（损坏数据返回 null）
 *
 * 规则只在这里汇总一次：真正的“第五张、14 张等效上限、四副面子、川麻无字/不能吃”
 * 判断复用 inputValidation.validateGameState，避免出现第二套规则口径。
 */

export interface EntryMessage {
  zh: string;
  en: string;
}

export type EntryPlan =
  | { outcome: 'applied'; state: GameState }
  | { outcome: 'rejected'; message: EntryMessage };

export type ParseTileTextResult =
  | { outcome: 'parsed'; tiles: Tile[] }
  | { outcome: 'rejected'; message: EntryMessage };

export interface TileAddRequest {
  zone: 'hand' | 'melds' | 'discards' | 'winningTile';
  meldType: Meld['type'];
  tile: Tile;
  /** 仅加杠时使用；缺省表示未记录杠类型。 */
  kongKind?: KongKind;
}

const reject = (message: EntryMessage): ParseTileTextResult => ({ outcome: 'rejected', message });
const refuse = (message: EntryMessage): EntryPlan => ({ outcome: 'rejected', message });

const SUIT_CHARS: Record<string, Suit> = {
  m: Suit.Man, '万': Suit.Man, '萬': Suit.Man,
  p: Suit.Pin, '筒': Suit.Pin,
  s: Suit.Sou, '条': Suit.Sou, '條': Suit.Sou,
  z: Suit.Zihai, '字': Suit.Zihai,
};

const SEPARATORS = new Set([' ', '\t', '\n', '\r', ',', '，', '、', '+', '/', '|']);

let sequence = 0;
// IDs must stay unique across reloads: saved melds outlive this module's counter.
const nextId = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${++sequence}`}`;

const suitOf = (char: string): Suit | undefined => SUIT_CHARS[char] ?? SUIT_CHARS[char.toLowerCase()];

const tileName = (tile: Tile): EntryMessage => ({
  zh: `${tile.value}${SUIT_LABELS.zh[tile.suit]}`,
  en: `${tile.value} ${SUIT_LABELS.en[tile.suit]}`,
});

/** 和牌张必须真的在暗手里；手牌变化后自动失效，避免记下无法核对的上下文。 */
/** 空局面：牌墙按玩法取初始值；只用于「新局面」导入和存储损坏兜底。 */
export const emptyEntryState = (mode: GameMode): GameState => ({
  mode,
  wallCount: mode === GameMode.MCR ? INITIAL_WALL_MCR : INITIAL_WALL_SICHUAN,
  voidSuit: null,
  hand: [],
  melds: [],
  discards: [],
  winSource: 'unknown',
});

/**
 * 截图或实拍照片导入后要写入的局面。单帧只能给出暗手和「已确认可见牌」：
 * - replace：按当前玩法重建局面（国标/四川的牌墙不同），已声明的四川定缺保留，不自动推断缺门
 * - continue：只替换暗手；`visibleRiver` 或用户确认打过的那张才进入已见牌河
 * 调用方仍须先跑 validateGameState，校验失败不得写入。
 */
export const planImportedState = (
  entry: GameState,
  mode: GameMode,
  hand: Tile[],
  options: { importMode?: 'replace' | 'continue'; visibleRiver?: Tile[]; confirmedDiscard?: Tile | null } = {},
): GameState => {
  const { importMode = 'replace', visibleRiver, confirmedDiscard } = options;
  const voidSuit = mode === GameMode.Sichuan ? entry.voidSuit : null;
  if (importMode === 'continue') {
    const discards = visibleRiver ?? (confirmedDiscard ? [...entry.discards, confirmedDiscard] : entry.discards);
    return { ...entry, hand, discards, voidSuit };
  }
  return { ...emptyEntryState(mode), hand, discards: visibleRiver ?? [], voidSuit };
};

export const withConsistentContext = (state: GameState): GameState => {
  const winning = winningTileInHand(state);
  // 删除最后一副自己的杠后，原有「杠上开花」事件不再有牌面证据。
  const sichuanWinEvent = state.mode === GameMode.Sichuan &&
    state.sichuanWinEvent === 'kongBloom' && !state.melds.some(m => m.type === 'gang')
      ? null : (state.sichuanWinEvent ?? null);
  if (winning === (state.winningTile ?? null) &&
      sichuanWinEvent === (state.sichuanWinEvent ?? null)) return state;
  return { ...state, winningTile: winning, sichuanWinEvent };
};

/** 用已存在的校验器产生候选局面的拒绝原因，保证文案与手动录入完全一致。 */
const acceptCandidate = (candidate: GameState): EntryPlan => {
  const consistent = withConsistentContext(candidate);
  const errors = validateGameState(consistent, 'zh', false);
  if (errors.length === 0) return { outcome: 'applied', state: consistent };
  const en = validateGameState(consistent, 'en', false);
  return refuse({ zh: errors[0], en: en[0] ?? errors[0] });
};

/**
 * 解析牌串。一组数字后紧跟花色后缀，可重复：
 * `33344466699977s`、`33344466699977条`、`123m456p789s11z`。
 * 允许 1–14 张（录入中间态）；牌值为 0、超出 9（字牌 7）或同种超过 4 张时拒绝。
 */
export const parseTileText = (text: string, mode: GameMode | null): ParseTileTextResult => {
  const tiles: Tile[] = [];
  let digits = '';

  const missingSuit = (): ParseTileTextResult => reject({
    zh: `“${digits}” 后面缺少花色后缀（m/p/s/z 或 万/筒/条/字）`,
    en: `"${digits}" needs a suit suffix (m/p/s/z)`,
  });

  for (const char of text) {
    if (SEPARATORS.has(char)) {
      if (digits) return missingSuit();
      continue;
    }
    if (char >= '0' && char <= '9') {
      digits += char;
      continue;
    }
    const suit = suitOf(char);
    if (!suit) {
      return reject({
        zh: `无法识别的字符“${char}”，只能用 m/p/s/z 或 万/筒/条/字`,
        en: `Unrecognized character "${char}"; use m/p/s/z only`,
      });
    }
    if (!digits) {
      return reject({
        zh: `花色“${char}”前面缺少数字`,
        en: `Suit "${char}" needs digits before it`,
      });
    }
    const max = suit === Suit.Zihai ? 7 : 9;
    for (const digit of digits) {
      const value = Number(digit);
      if (value < 1 || value > max) {
        return reject({
          zh: `${SUIT_LABELS.zh[suit]}的牌值只能是 1–${max}，“${digit}”无效`,
          en: `${SUIT_LABELS.en[suit]} values are 1–${max}; "${digit}" is invalid`,
        });
      }
      tiles.push({ id: nextId('text'), suit, value });
    }
    digits = '';
  }

  if (digits) return missingSuit();
  if (tiles.length === 0) return reject({ zh: '请输入牌串', en: 'Enter a tile string' });
  if (tiles.length > MAX_TILES_IN_HAND) {
    return reject({
      zh: `牌串有 ${tiles.length} 张，最多只能录入 ${MAX_TILES_IN_HAND} 张`,
      en: `${tiles.length} tiles exceed the ${MAX_TILES_IN_HAND}-tile limit`,
    });
  }
  const counted = countTiles(tiles);
  const overflowTile = tiles.find(t => (counted.get(getTileKey(t.suit, t.value)) ?? 0) > 4);
  if (overflowTile) {
    const name = tileName(overflowTile);
    return reject({
      zh: `牌串里 ${name.zh} 超过 4 张`,
      en: `The string holds more than four copies of ${name.en}`,
    });
  }
  if (mode === GameMode.Sichuan) {
    if (tiles.some(t => t.suit === Suit.Zihai)) {
      return reject({ zh: '川麻没有字牌', en: 'Sichuan mahjong uses no honor tiles' });
    }
  }
  return { outcome: 'parsed', tiles };
};

/** 文本替换暗手：解析成功且整局校验通过才返回新局面，失败不产生任何部分更新。 */
export const planTextHand = (state: GameState, text: string): EntryPlan => {
  const parsed = parseTileText(text, state.mode);
  if (parsed.outcome === 'rejected') return parsed;
  return acceptCandidate({ ...state, hand: parsed.tiles });
};

/** 一次录入请求（点牌或加一副面子）：先算出全部牌张，再整体校验后提交。 */
export const planTileAdd = (state: GameState, request: TileAddRequest): EntryPlan => {
  const { zone, meldType, tile, kongKind } = request;

  // 和牌张是「第 14 张」，不占手牌张数；必须与暗手里已有的同种牌对应。
  if (zone === 'winningTile') {
    const held = countTiles(state.hand).get(getTileKey(tile.suit, tile.value)) ?? 0;
    if (held === 0) {
      const name = tileName(tile);
      return refuse({
        zh: `${name.zh} 不在暗手里，和牌张只能从暗手中选择`,
        en: `${name.en} is not in the concealed hand; the winning tile must come from it`,
      });
    }
    return acceptCandidate({ ...state, winningTile: tile });
  }

  if (zone === 'hand' && state.hand.length + state.melds.length * 3 >= MAX_TILES_IN_HAND) {
    return refuse({
      zh: `手牌已满（${MAX_TILES_IN_HAND} 张等效牌上限）`,
      en: `Hand is full (${MAX_TILES_IN_HAND} effective tiles max)`,
    });
  }

  let tilesToAdd: Tile[];
  if (zone === 'melds') {
    if (meldType === 'chi') {
      if (tile.suit === Suit.Zihai || tile.value + 2 > 9) {
        return refuse({
          zh: '吃牌只能从同花色的 1–7 起，顺子不能超过 9',
          en: 'A chow starts at 1–7 within one suit; a run cannot pass 9',
        });
      }
      tilesToAdd = [
        tile,
        createTile(tile.suit, tile.value + 1),
        createTile(tile.suit, tile.value + 2),
      ];
    } else if (meldType === 'pong') {
      tilesToAdd = [tile, createTile(tile.suit, tile.value), createTile(tile.suit, tile.value)];
    } else {
      tilesToAdd = [
        tile,
        createTile(tile.suit, tile.value),
        createTile(tile.suit, tile.value),
        createTile(tile.suit, tile.value),
      ];
    }
  } else {
    tilesToAdd = [tile];
  }

  // 先检查预期添加的所有牌张（吃的第二、三张也在内），再整体提交。
  const all = [...state.hand, ...state.melds.flatMap(m => m.tiles), ...state.discards];
  const used = countTiles(all);
  const needed = countTiles(tilesToAdd);
  for (const candidate of tilesToAdd) {
    const key = getTileKey(candidate.suit, candidate.value);
    const held = used.get(key) ?? 0;
    const adding = needed.get(key) ?? 0;
    if (held + adding > 4) {
      const name = tileName(candidate);
      return refuse({
        zh: `${name.zh} 已见 ${held} 张，本次添加 ${adding} 张会超过 4 张上限`,
        en: `${held} copies of ${name.en} are known; adding ${adding} exceeds the four-copy limit`,
      });
    }
  }

  if (zone === 'melds') {
    const meld: Meld = { id: nextId('meld'), type: meldType, tiles: tilesToAdd, ...(meldType === 'gang' && kongKind ? { kongKind } : {}) };
    return acceptCandidate({ ...state, melds: [...state.melds, meld] });
  }
  if (zone === 'hand') return acceptCandidate({ ...state, hand: [...state.hand, tile] });
  return acceptCandidate({ ...state, discards: [...state.discards, tile] });
};

export const ENTRY_STORAGE_VERSION = 1;

/** 每种玩法一个键，避免国标与川麻互相覆盖。 */
export const entryStorageKey = (mode: GameMode): string =>
  `mahjong-copilot.entry.v${ENTRY_STORAGE_VERSION}.${mode}`;

export const encodeEntryState = (state: GameState): string =>
  JSON.stringify({ version: ENTRY_STORAGE_VERSION, state });

const tileArray = (value: unknown): Tile[] | null => {
  if (!Array.isArray(value)) return null;
  const tiles: Tile[] = [];
  for (const item of value) {
    if (!isTile(item)) return null;
    tiles.push(item);
  }
  return tiles;
};

const isMeld = (value: unknown): value is Meld => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('id' in value) || typeof value.id !== 'string') return false;
  if (!('type' in value) || (value.type !== 'chi' && value.type !== 'pong' && value.type !== 'gang')) return false;
  if (!('tiles' in value)) return false;
  if ('kongKind' in value && value.kongKind !== undefined) {
    const kinds: KongKind[] = ['exposed', 'concealed', 'added'];
    if (!kinds.some(kind => kind === value.kongKind)) return false;
  }
  return tileArray(value.tiles) !== null;
};

const meldArray = (value: unknown): Meld[] | null => {
  if (!Array.isArray(value)) return null;
  const melds: Meld[] = [];
  for (const item of value) {
    if (!isMeld(item)) return null;
    melds.push(item);
  }
  return melds;
};

const isWindValue = (value: unknown): value is Wind => value === 1 || value === 2 || value === 3 || value === 4;

/**
 * 读取本地局面。旧版本、结构损坏、牌值非法或玩法不符一律返回 null，
 * 由调用方回落到空局面，绝不用半截数据构造状态。
 */
export const decodeEntryState = (raw: string | null, mode: GameMode): GameState | null => {
  if (!raw) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  if (!('version' in payload) || typeof payload.version !== 'number' || payload.version !== ENTRY_STORAGE_VERSION) return null;
  if (!('state' in payload) || typeof payload.state !== 'object' || payload.state === null) return null;
  const state = payload.state;
  if (!('mode' in state) || typeof state.mode !== 'string' || state.mode !== mode) return null;
  if (!('hand' in state) || !('discards' in state) || !('melds' in state)) return null;

  const hand = tileArray(state.hand);
  const discards = tileArray(state.discards);
  const melds = meldArray(state.melds);
  if (!hand || !discards || !melds) return null;
  // IDs are used as React keys and as deletion targets. Reject corrupted storage
  // instead of allowing one click to remove multiple tiles or melds.
  const tileIds = [...hand, ...discards, ...melds.flatMap(meld => meld.tiles)].map(tile => tile.id);
  const meldIds = melds.map(meld => meld.id);
  if (tileIds.some(id => id.length === 0) || new Set(tileIds).size !== tileIds.length ||
      meldIds.some(id => id.length === 0) || new Set(meldIds).size !== meldIds.length) return null;
  if (!('wallCount' in state) || typeof state.wallCount !== 'number') return null;

  let voidSuit: Suit | null = null;
  if ('voidSuit' in state && state.voidSuit !== null && state.voidSuit !== undefined) {
    const found = Object.values(Suit).find(suit => suit === state.voidSuit);
    if (!found) return null;
    voidSuit = found;
  }

  // 和牌方式：只在三个合法值内恢复，损坏数据整局丢弃，绝不猜成自摸或点和
  let winSource: WinSource = 'unknown';
  if ('winSource' in state && state.winSource !== undefined && state.winSource !== null) {
    const sources: WinSource[] = ['selfDraw', 'claim', 'unknown'];
    const found = sources.find(source => source === state.winSource);
    if (!found) return null;
    winSource = found;
  }

  // 和牌上下文：非法值整局丢弃；和牌张不在暗手里时按未记录处理，保留其余局面。
  let seatWind: Wind | null = null;
  if ('seatWind' in state && state.seatWind !== undefined && state.seatWind !== null) {
    if (!isWindValue(state.seatWind)) return null;
    seatWind = state.seatWind;
  }
  let roundWind: Wind | null = null;
  if ('roundWind' in state && state.roundWind !== undefined && state.roundWind !== null) {
    if (!isWindValue(state.roundWind)) return null;
    roundWind = state.roundWind;
  }
  let lastTile: boolean | null = null;
  if ('lastTile' in state && state.lastTile !== undefined && state.lastTile !== null) {
    if (typeof state.lastTile !== 'boolean') return null;
    lastTile = state.lastTile;
  }
  let afterKong: boolean | null = null;
  if ('afterKong' in state && state.afterKong !== undefined && state.afterKong !== null) {
    if (typeof state.afterKong !== 'boolean') return null;
    afterKong = state.afterKong;
  }
  let winningTile: Tile | null = null;
  if ('winningTile' in state && state.winningTile !== undefined && state.winningTile !== null) {
    if (!isTile(state.winningTile)) return null;
    winningTile = state.winningTile;
  }

  let sichuanWinEvent: SichuanWinEvent | null = null;
  if ('sichuanWinEvent' in state && state.sichuanWinEvent !== undefined && state.sichuanWinEvent !== null) {
    if (!isSichuanWinEvent(state.sichuanWinEvent)) return null;
    sichuanWinEvent = state.sichuanWinEvent;
  }
  const candidate = withConsistentContext({
    mode, wallCount: state.wallCount, voidSuit, hand, melds, discards, winSource,
    seatWind, roundWind, lastTile, afterKong, winningTile, sichuanWinEvent,
  });
  return validateGameState(candidate, 'zh', false).length === 0 ? candidate : null;
};
