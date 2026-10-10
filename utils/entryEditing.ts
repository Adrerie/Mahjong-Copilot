import { GameMode, GameState, Meld, Suit, Tile } from '../types';
import { MAX_TILES_IN_HAND, SUIT_LABELS, createTile, getTileKey } from '../constants';
import { countTiles } from './tileHelpers';
import { isTile, validateGameState } from './inputValidation';

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
  zone: 'hand' | 'melds' | 'discards';
  meldType: Meld['type'];
  tile: Tile;
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

/** 用已存在的校验器产生候选局面的拒绝原因，保证文案与手动录入完全一致。 */
const acceptCandidate = (candidate: GameState): EntryPlan => {
  const errors = validateGameState(candidate, 'zh', false);
  if (errors.length === 0) return { outcome: 'applied', state: candidate };
  const en = validateGameState(candidate, 'en', false);
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
  const { zone, meldType, tile } = request;

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
    const meld: Meld = { id: nextId('meld'), type: meldType, tiles: tilesToAdd };
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

  const candidate: GameState = { mode, wallCount: state.wallCount, voidSuit, hand, melds, discards };
  return validateGameState(candidate, 'zh', false).length === 0 ? candidate : null;
};
