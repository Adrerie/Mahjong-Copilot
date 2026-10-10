import { GameMode, GameState, Language, Suit, Tile } from '../types';
import { MAX_WALL_MCR, MAX_WALL_SICHUAN } from '../constants';
import { countTiles } from './tileHelpers';

export const isTile = (value: unknown): value is Tile => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('id' in value) || typeof value.id !== 'string' || !('suit' in value) || !('value' in value)) return false;
  return Object.values(Suit).some(s => s === value.suit) && typeof value.value === 'number' &&
    Number.isInteger(value.value) && value.value >= 1 && value.value <= (value.suit === Suit.Zihai ? 7 : 9);
};

export const validateGameState = (state: GameState, lang: Language, requireComplete = true): string[] => {
  const error = (zh: string, en: string) => lang === 'zh' ? zh : en;
  const errors: string[] = [];
  const all = [...state.hand, ...state.melds.flatMap(m => m.tiles), ...state.discards];
  if (state.mode !== GameMode.MCR && state.mode !== GameMode.Sichuan) errors.push(error('请选择玩法', 'Choose a game mode'));
  if (all.some(t => !isTile(t))) return [error('含有无效牌', 'Invalid tile')];
  if ([...countTiles(all).values()].some(c => c > 4)) errors.push(error('每种牌最多4张（含副露和牌河）', 'At most four copies of each tile, including melds and river'));
  if (state.melds.length > 4 || state.hand.length + state.melds.length * 3 > 14) errors.push(error('最多4副面子，总等效牌数不能超过14', 'At most four melds and 14 effective tiles'));
  for (const meld of state.melds) {
    const sorted = [...meld.tiles].sort((a, b) => a.value - b.value);
    const sameSuit = sorted.length > 0 && sorted.every(t => t.suit === sorted[0].suit);
    const valid = sameSuit && (meld.type === 'chi'
      ? sorted.length === 3 && sorted[0].suit !== Suit.Zihai && sorted.every((t, i) => t.value === sorted[0].value + i)
      : (meld.type === 'pong' || meld.type === 'gang') && sorted.length === (meld.type === 'gang' ? 4 : 3) && sorted.every(t => t.value === sorted[0].value));
    if (!valid) errors.push(error('副露组合不合法', 'Invalid meld'));
  }
  const total = state.hand.length + state.melds.length * 3;
  if (requireComplete && total !== 13 && total !== 14) errors.push(error('请录入13或14张等效牌（杠按3张计算）', 'Enter 13 or 14 effective tiles (a kong counts as three)'));
  if (!Number.isInteger(state.wallCount) || state.wallCount < 0 || state.wallCount > (state.mode === GameMode.Sichuan ? MAX_WALL_SICHUAN : MAX_WALL_MCR)) errors.push(error('牌墙数量超出范围', 'Wall count is out of range'));
  if (state.mode === GameMode.Sichuan) {
    if (all.some(t => t.suit === Suit.Zihai) || state.melds.some(m => m.type === 'chi')) errors.push(error('川麻无字牌且不能吃牌', 'Sichuan uses no honors or chows'));
    if (requireComplete && !state.voidSuit) errors.push(error('请选择定缺花色', 'Choose a void suit'));
    if (state.voidSuit === Suit.Zihai) errors.push(error('定缺只能选择万、筒、条', 'Void suit must be a numbered suit'));
  }
  return [...new Set(errors)];
};
