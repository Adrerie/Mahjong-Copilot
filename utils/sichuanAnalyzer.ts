/**
 * 四川血战到底计番（示例口径）
 *
 * 规则来源 ruleId `hi8-blood-battle`：Hi8 血战到底牌桌页面记录的口径
 * https://hi8.com/g/sichuanmajiang —— 平胡 0、对对胡 1、清一色 2、七对 2、带幺九 2、
 * 金钩钓 2（包含对对胡）、每根 +1，封顶 4 指数番 = 16 倍。
 *
 * 边界：
 * - 这是该页面标注的**示例口径**，不是四川/重庆统一规范；2026-10-10复核了原页面。
 *   允许叠加的番型仍须在同一合法拆分中成立，七对和标准面子拆分分别评分后择高。
 * - 倍率 = 2^min(指数番, 封顶)，不再使用旧表「清对 6 番 = 64 倍」这类写法。
 * - 未记录自摸/点炮、杠类型、海底/抢杠等事件，因此不加这些番，只在结果里标注待补。
 * - 番型按**合法面子拆分**判断（对对胡、带幺九），不按「存在几张刻子」推断。
 */

import { Suit, Tile, Meld, FanSuggestion, Language } from '../types';
import { createTile, TEXT } from '../constants';
import { countTiles, countsToArray } from './tileHelpers';

// ========== 规则表（唯一来源） ==========

export const SICHUAN_RULE = {
  id: 'hi8-blood-battle',
  source: 'https://hi8.com/g/sichuanmajiang',
  capExponent: 4,
} as const;

/** 该口径下的番型指数；金钩钓已包含对对胡，因此两者不叠加。 */
export const SICHUAN_PATTERN_EXPONENTS = {
  pingHu: 0,
  duiDuiHu: 1,
  qingYiSe: 2,
  qiDui: 2,
  daiYaoJiu: 2,
  jinGouDiao: 2,
} as const;

export type SichuanPatternId = keyof typeof SICHUAN_PATTERN_EXPONENTS;

export interface SichuanPatternHit {
  id: SichuanPatternId;
  exponent: number;
}

export interface SichuanScore {
  ruleId: string;
  ruleSource: string;
  capExponent: number;
  /** 复合番型的常见叫法，只用于显示，不代表额外番。 */
  label: string;
  /** 「3 指数番 · 8 倍」形式的显示文本。 */
  scoreText: string;
  patterns: SichuanPatternHit[];
  baseExponent: number;
  roots: number;
  uncappedExponent: number;
  cappedExponent: number;
  multiplier: number;
  details: string[];
  pendingContext: string;
}

// ========== 合法面子拆分 ==========

/** 0-33 索引对应的牌值；字牌返回 0（四川不用字牌）。 */
const indexValue = (index: number): number => (index < 27 ? (index % 9) + 1 : 0);

/** 幺九：序数牌的 1 或 9。 */
const isTerminalIndex = (index: number): boolean => index < 27 && (index % 9 === 0 || index % 9 === 8);

const isTerminalValue = (value: number): boolean => value === 1 || value === 9;

interface ShapeRequirement {
  /** 面子只能是刻子/杠（对对胡）。 */
  tripletsOnly: boolean;
  /** 每副面子都必须带幺九（带幺九）。 */
  terminalMelds: boolean;
  /** 将牌必须带幺九（带幺九）。 */
  terminalPair: boolean;
}

/** 递归把剩余牌拆成 need 副面子，所有牌必须用完。 */
const formGroups = (tiles: number[], need: number, req: ShapeRequirement): boolean => {
  if (need === 0) return tiles.every(count => count === 0);
  let first = -1;
  for (let i = 0; i < 34; i++) {
    if (tiles[i] > 0) { first = i; break; }
  }
  if (first < 0) return false;

  if (tiles[first] >= 3 && (!req.terminalMelds || isTerminalIndex(first))) {
    tiles[first] -= 3;
    if (formGroups(tiles, need - 1, req)) { tiles[first] += 3; return true; }
    tiles[first] += 3;
  }

  if (!req.tripletsOnly && first < 27 && first % 9 <= 6 &&
    (!req.terminalMelds || isTerminalIndex(first) || isTerminalIndex(first + 2)) &&
    tiles[first] >= 1 && tiles[first + 1] >= 1 && tiles[first + 2] >= 1) {
    tiles[first]--; tiles[first + 1]--; tiles[first + 2]--;
    if (formGroups(tiles, need - 1, req)) {
      tiles[first]++; tiles[first + 1]++; tiles[first + 2]++;
      return true;
    }
    tiles[first]++; tiles[first + 1]++; tiles[first + 2]++;
  }

  return false;
};

/** 暗手能否拆成 needMelds 副面子 + 1 对将，且满足给定约束。 */
const concealedFits = (counts: number[], needMelds: number, req: ShapeRequirement): boolean => {
  if (counts.length !== 34) return false;
  for (let pair = 0; pair < 34; pair++) {
    if (counts[pair] < 2) continue;
    if (req.terminalPair && !isTerminalIndex(pair)) continue;
    const rest = [...counts];
    rest[pair] -= 2;
    if (formGroups(rest, needMelds, req)) return true;
  }
  return false;
};

/** 四张相同的牌各自算一根（含副露杠的四张）。 */
const countRoots = (counts: Map<string, number>): number => {
  let roots = 0;
  counts.forEach(count => { if (count === 4) roots++; });
  return roots;
};

const countPairs = (counts: Map<string, number>): number => {
  let pairs = 0;
  counts.forEach(count => { pairs += Math.floor(count / 2); });
  return pairs;
};

// ========== 和牌计番 ==========

export const recognizeSichuanPatterns = (hand: Tile[], melds: Meld[], lang: Language): SichuanScore => {
  const t = TEXT[lang];
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const allCounts = countTiles(allTiles);
  const handCounts = countsToArray(countTiles(hand));

  const roots = countRoots(allCounts);

  const noHonors = allTiles.every(tile => tile.suit !== Suit.Zihai);
  const suits = new Set(allTiles.map(tile => tile.suit));
  const isFullFlush = noHonors && allTiles.length > 0 && suits.size === 1;

  const exposedPongs = melds.filter(m => m.type === 'pong' || m.type === 'gang');
  const allMeldsArePongs = exposedPongs.length === melds.length;
  const needMelds = 4 - melds.length;

  // 金钩钓：四副碰/杠 + 单钓将，按来源包含对对胡（不再重复计对对胡）
  const isJinGouDiao = melds.length === 4 && allMeldsArePongs && hand.length === 2;
  const isDuiDui = !isJinGouDiao && allMeldsArePongs &&
    concealedFits(handCounts, needMelds, { tripletsOnly: true, terminalMelds: false, terminalPair: false });
  // 带幺九：每副面子与将牌都必须带 1 或 9，顺子 123/789 也算
  const isDaiYaoJiu = melds.every(m => m.tiles.some(tile => isTerminalValue(tile.value))) &&
    concealedFits(handCounts, needMelds, { tripletsOnly: false, terminalMelds: true, terminalPair: true });
  // 七对：四张相同的牌按两对计
  const isQiDui = melds.length === 0 && allTiles.length === 14 && countPairs(allCounts) === 7 &&
    [...allCounts.values()].every(count => count % 2 === 0);

  const standardHits: SichuanPatternHit[] = [];
  if (isJinGouDiao) standardHits.push({ id: 'jinGouDiao', exponent: SICHUAN_PATTERN_EXPONENTS.jinGouDiao });
  else if (isDuiDui) standardHits.push({ id: 'duiDuiHu', exponent: SICHUAN_PATTERN_EXPONENTS.duiDuiHu });
  if (isDaiYaoJiu) standardHits.push({ id: 'daiYaoJiu', exponent: SICHUAN_PATTERN_EXPONENTS.daiYaoJiu });
  const pairHits: SichuanPatternHit[] = [];
  if (isQiDui) {
    pairHits.push({ id: 'qiDui', exponent: SICHUAN_PATTERN_EXPONENTS.qiDui });
    // 七对里的每对必须自身是幺九，不能借用另一种顺子拆分的带幺九。
    if (allTiles.every(tile => isTerminalValue(tile.value))) {
      pairHits.push({ id: 'daiYaoJiu', exponent: SICHUAN_PATTERN_EXPONENTS.daiYaoJiu });
    }
  }
  const sum = (patterns: SichuanPatternHit[]) => patterns.reduce((total, hit) => total + hit.exponent, 0);
  const hits = [...(isQiDui && sum(pairHits) >= sum(standardHits) ? pairHits : standardHits)];
  if (isFullFlush) hits.unshift({ id: 'qingYiSe', exponent: SICHUAN_PATTERN_EXPONENTS.qingYiSe });
  if (hits.length === 0) hits.push({ id: 'pingHu', exponent: SICHUAN_PATTERN_EXPONENTS.pingHu });

  const names: Record<SichuanPatternId, string> = {
    pingHu: t.pingHu, duiDuiHu: t.duiDuiHu, qingYiSe: t.qingYiSe,
    qiDui: t.qiDui, daiYaoJiu: t.daiYaoJiu, jinGouDiao: t.jinGouDiao,
  };

  const baseExponent = hits.reduce((sum, hit) => sum + hit.exponent, 0);
  const uncappedExponent = baseExponent + roots;
  const cappedExponent = Math.min(uncappedExponent, SICHUAN_RULE.capExponent);
  const multiplier = Math.pow(2, cappedExponent);

  const has = (id: SichuanPatternId) => hits.some(hit => hit.id === id);
  let label: string;
  if (has('qiDui')) {
    label = isFullFlush
      ? (roots > 0 ? t.qingLongQiDui : t.qingQiDui)
      : (roots > 0 ? t.longQiDui : t.qiDui);
  } else if (has('jinGouDiao')) {
    label = isFullFlush ? t.qingJinGou : t.jinGouDiao;
  } else if (has('duiDuiHu')) {
    label = isFullFlush ? t.qingDui : t.duiDuiHu;
  } else if (isFullFlush) {
    label = t.qingYiSe;
  } else if (has('daiYaoJiu')) {
    label = t.daiYaoJiu;
  } else {
    label = t.pingHu;
  }

  const details = [...hits]
    .sort((a, b) => b.exponent - a.exponent)
    .map(hit => `${names[hit.id]} (${hit.exponent} ${t.exponentUnit})`);
  if (roots > 0) details.push(`${t.root} ×${roots} (+${roots})`);
  details.push(uncappedExponent > SICHUAN_RULE.capExponent
    ? `${t.exponentUnit} ${uncappedExponent} → ${lang === 'zh' ? '封顶' : 'capped at'} ${SICHUAN_RULE.capExponent} = ${multiplier} ${t.timesUnit}`
    : `${t.exponentUnit} ${uncappedExponent} = ${multiplier} ${t.timesUnit}`);
  details.push(t.pendingEvents);

  return {
    ruleId: SICHUAN_RULE.id,
    ruleSource: SICHUAN_RULE.source,
    capExponent: SICHUAN_RULE.capExponent,
    label,
    scoreText: `${cappedExponent} ${t.exponentUnit} · ${multiplier} ${t.timesUnit}`,
    patterns: [...hits].sort((a, b) => b.exponent - a.exponent),
    baseExponent,
    roots,
    uncappedExponent,
    cappedExponent,
    multiplier,
    details,
    pendingContext: t.pendingEvents,
  };
};

// ========== 未成牌时的番型潜力 ==========

/**
 * 未成牌时的参考提示：只列当前牌型还能做的番型与还缺的牌，
 * 不给概率、不给倍率，也不代表结算。
 */
export const analyzeSichuan = (hand: Tile[], melds: Meld[], voidSuit: Suit | null, lang: Language): FanSuggestion[] => {
  const t = TEXT[lang];
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];

  if (voidSuit && allTiles.some(tile => tile.suit === voidSuit)) {
    // 定缺未打完：不是和牌，也不给番数/倍率，只说明该局面无法和牌。
    return [{
      name: t.huaZhu,
      fan: 0,
      baseFan: 0,
      probability: 0,
      missingTiles: [],
      patternDetails: [t.illegal],
      description: t.illegal,
      scoreText: t.illegal,
    }];
  }

  const suggestions: FanSuggestion[] = [];
  const maybe = (name: string, exponent: number, missing: Tile[], extra: string[] = []) => {
    suggestions.push({
      name,
      fan: exponent,
      baseFan: exponent,
      probability: 0,
      missingTiles: missing,
      patternDetails: [`${name} (${exponent} ${t.exponentUnit})`, ...extra, t.potentialOnly],
      scoreText: `${exponent} ${t.exponentUnit} · ${t.potential}`,
    });
  };

  const counts = countTiles(allTiles);
  const noHonors = allTiles.every(tile => tile.suit !== Suit.Zihai);
  const suits = new Set(allTiles.map(tile => tile.suit));
  const isFullFlush = noHonors && allTiles.length > 0 && suits.size === 1;

  const suitCounts: { suit: Suit; count: number }[] = [Suit.Man, Suit.Pin, Suit.Sou]
    .map(suit => ({ suit, count: allTiles.filter(tile => tile.suit === suit).length }));
  const mainSuit = suitCounts.reduce((best, cur) => (cur.count > best.count ? cur : best), suitCounts[0]);
  const otherSuitCount = allTiles.length - mainSuit.count;

  const pairTiles: Tile[] = [];
  const singleTiles: Tile[] = [];
  counts.forEach((count, key) => {
    const { value, suit } = parseTileKey(key);
    if (count === 1 || count === 3) singleTiles.push(createTile(suit, value));
    if (count === 2) pairTiles.push(createTile(suit, value));
  });

  if (isFullFlush) {
    maybe(t.qingYiSe, SICHUAN_PATTERN_EXPONENTS.qingYiSe, []);
  } else if (otherSuitCount <= 3 && mainSuit.count >= 9) {
    const suitName = lang === 'zh'
      ? (mainSuit.suit === Suit.Man ? '万' : mainSuit.suit === Suit.Pin ? '筒' : '条')
      : (mainSuit.suit === Suit.Man ? 'Wan' : mainSuit.suit === Suit.Pin ? 'Pin' : 'Sou');
    const hint = lang === 'zh'
      ? `做清${suitName}，需换 ${otherSuitCount} 张`
      : `Go for ${suitName}: swap out ${otherSuitCount} tiles`;
    maybe(t.qingYiSe, SICHUAN_PATTERN_EXPONENTS.qingYiSe, [], [hint]);
  }

  if (melds.length === 0) {
    const pairs = countPairs(counts);
    if (pairs >= 4) {
      maybe(t.qiDui, SICHUAN_PATTERN_EXPONENTS.qiDui, singleTiles.slice(0, 7 - pairs));
    }
  }

  let concealedTriplets = 0;
  countTiles(hand).forEach(count => { if (count >= 3) concealedTriplets++; });
  const pongMelds = melds.filter(m => m.type === 'pong' || m.type === 'gang').length;
  const triplets = concealedTriplets + pongMelds;
  if (triplets >= 2 && triplets < 4) {
    maybe(t.duiDuiHu, SICHUAN_PATTERN_EXPONENTS.duiDuiHu, pairTiles.slice(0, 4 - triplets));
  }
  if (pongMelds >= 3 && !(melds.length === 4 && hand.length === 2)) {
    maybe(t.jinGouDiao, SICHUAN_PATTERN_EXPONENTS.jinGouDiao, pairTiles.slice(0, 1));
  }

  if (suggestions.length === 0) {
    maybe(t.pingHu, SICHUAN_PATTERN_EXPONENTS.pingHu, []);
  }

  return suggestions.sort((a, b) => b.fan - a.fan);
};

/** 解析 "3m" 形式的牌键。 */
const parseTileKey = (key: string): { value: number; suit: Suit } => {
  const value = parseInt(key[0], 10);
  const suitChar = key.slice(1);
  const suit = suitChar === 'm' ? Suit.Man : suitChar === 'p' ? Suit.Pin : suitChar === 's' ? Suit.Sou : Suit.Zihai;
  return { value, suit };
};
