import { GameMode, GameState, KongKind, Language, SichuanWinEvent, Suit, Tile, Wind } from '../types';
import { MAX_WALL_MCR, MAX_WALL_SICHUAN, getTileKey } from '../constants';
import { countTiles } from './tileHelpers';

export const isTile = (value: unknown): value is Tile => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('id' in value) || typeof value.id !== 'string' || !('suit' in value) || !('value' in value)) return false;
  return Object.values(Suit).some(s => s === value.suit) && typeof value.value === 'number' &&
    Number.isInteger(value.value) && value.value >= 1 && value.value <= (value.suit === Suit.Zihai ? 7 : 9);
};

const isWind = (value: unknown): value is Wind => value === 1 || value === 2 || value === 3 || value === 4;
const isKongKind = (value: unknown): value is KongKind =>
  value === 'exposed' || value === 'concealed' || value === 'added';
export const isSichuanWinEvent = (value: unknown): value is SichuanWinEvent =>
  value === 'ordinary' || value === 'kongBloom' || value === 'kongDiscard' ||
  value === 'robbingKong' || value === 'lastDraw' || value === 'lastDiscard';
export const sichuanEventSource = (event: SichuanWinEvent): 'selfDraw' | 'claim' | null =>
  event === 'kongBloom' || event === 'lastDraw' ? 'selfDraw' :
  event === 'kongDiscard' || event === 'robbingKong' || event === 'lastDiscard' ? 'claim' : null;

/** 和牌张必须真的在暗手里；不在则视为未记录，绝不猜。 */
export const winningTileInHand = (state: GameState): Tile | null => {
  const winning = state.winningTile;
  if (!winning || !isTile(winning)) return null;
  const hand = countTiles(state.hand);
  return (hand.get(getTileKey(winning.suit, winning.value)) ?? 0) > 0 ? winning : null;
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
    if (meld.kongKind !== undefined && (meld.type !== 'gang' || !isKongKind(meld.kongKind))) {
      errors.push(error('只有杠才能记录明杠/暗杠/补杠', 'Only a kong can record melded, concealed or added'));
    }
  }
  // 四川特殊事件不复用国标的末张/杠后标记：两者的含义和结算不同。
  if (state.winSource !== undefined && !['selfDraw', 'claim', 'unknown'].includes(state.winSource)) {
    errors.push(error('和牌方式不合法', 'Invalid win source'));
  }
  if (state.sichuanWinEvent != null && (state.mode !== GameMode.Sichuan || !isSichuanWinEvent(state.sichuanWinEvent))) {
    errors.push(error('四川和牌事件不合法', 'Invalid Sichuan win event'));
  } else if (state.mode === GameMode.Sichuan && state.sichuanWinEvent) {
    const expected = sichuanEventSource(state.sichuanWinEvent);
    if (expected && state.winSource !== expected) errors.push(error('特殊事件与自摸/点炮不一致', 'Win event conflicts with win source'));
    if (state.sichuanWinEvent === 'kongBloom' && !state.melds.some(m => m.type === 'gang')) {
      errors.push(error('杠上开花须记录自己的杠', 'Kong bloom requires a recorded own kong'));
    }
  }
  // 和牌上下文：记录了就必须合法；和牌张不在暗手时按未记录处理，不报错也不计番。
  if (state.mode === GameMode.MCR) {
    if (state.winningTile != null && !isTile(state.winningTile)) errors.push(error('和牌张不合法', 'Invalid winning tile'));
    if (state.seatWind != null && !isWind(state.seatWind)) errors.push(error('门风只能是东南西北', 'Seat wind must be E, S, W or N'));
    if (state.roundWind != null && !isWind(state.roundWind)) errors.push(error('圈风只能是东南西北', 'Round wind must be E, S, W or N'));
    if (state.lastTile !== undefined && state.lastTile !== null && typeof state.lastTile !== 'boolean') {
      errors.push(error('末张标记只能是是或否', 'Last-tile flag must be true or false'));
    }
    if (state.afterKong !== undefined && state.afterKong !== null && typeof state.afterKong !== 'boolean') {
      errors.push(error('杠后和牌标记只能是是或否', 'After-kong flag must be true or false'));
    }
  } else if (state.seatWind != null || state.roundWind != null || state.lastTile != null ||
      state.afterKong != null || state.winningTile != null) {
    errors.push(error('川麻不使用国标和牌上下文', 'Sichuan does not use MCR win context'));
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
