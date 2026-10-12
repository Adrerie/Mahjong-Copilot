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
 * - 自摸/点炮决定付款方向，不默认加番；明确记录的五类特殊和牌事件各 +1 指数番（封顶前）。
 * - 不推断杠分转移、查叫/查花猪、支付人数及房间“自摸加底/加番”差异。
 * - 番型按**合法面子拆分**判断（对对胡、带幺九），不按「存在几张刻子」推断：
 *   枚举暗手每个合法「4 副面子 + 1 将」拆分，各拆分成套计番后择高。因此
 *   111222333m99911p 只计带幺九 2 指数番（123×3 拆分），不叠加另一套刻子拆分的对对胡；
 *   未选拆分不参与计番或普通结果显示。
 * - 清一色与根不依赖拆分，正常与选中的拆分相加。
 */

import { Suit, Tile, Meld, FanSuggestion, Language, SichuanWinEvent, WinSource } from '../types';
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
  eventExponent: number;
  uncappedExponent: number;
  cappedExponent: number;
  multiplier: number;
  details: string[];
  pendingContext: string;
}

// ========== 合法面子拆分 ==========

/** 幺九：序数牌的 1 或 9。 */
const isTerminalIndex = (index: number): boolean => index < 27 && (index % 9 === 0 || index % 9 === 8);

const isTerminalValue = (value: number): boolean => value === 1 || value === 9;

interface MeldGroup {
  /** pung = 刻子/杠，chow = 顺子。 */
  kind: 'pung' | 'chow';
  /** 刻子的牌索引；顺子的起始牌索引。 */
  index: number;
}

interface Decomposition {
  /** 除将牌外的 needMelds 副面子。 */
  groups: MeldGroup[];
  /** 将牌的牌索引。 */
  pair: number;
}

/** 一副面子是否带幺九：刻子看自身，顺子看两端（123/789 算带幺九）。 */
const groupHasTerminal = (group: MeldGroup): boolean =>
  group.kind === 'pung'
    ? isTerminalIndex(group.index)
    : isTerminalIndex(group.index) || isTerminalIndex(group.index + 2);

const decompositionKey = (groups: MeldGroup[], pair: number): string =>
  `${pair}|${groups.map(group => `${group.kind}${group.index}`).sort().join(',')}`;

/** 递归用完剩余牌拆出 need 副面子；同一套面子组合只保留一份。 */
const collectDecompositions = (
  tiles: number[], need: number, groups: MeldGroup[], pair: number, out: Map<string, Decomposition>,
): void => {
  if (need === 0) {
    if (!tiles.every(count => count === 0)) return;
    const key = decompositionKey(groups, pair);
    if (!out.has(key)) out.set(key, { groups: [...groups], pair });
    return;
  }
  let first = -1;
  for (let i = 0; i < 34; i++) {
    if (tiles[i] > 0) { first = i; break; }
  }
  if (first < 0) return;

  if (tiles[first] >= 3) {
    tiles[first] -= 3;
    groups.push({ kind: 'pung', index: first });
    collectDecompositions(tiles, need - 1, groups, pair, out);
    groups.pop();
    tiles[first] += 3;
  }

  if (first < 27 && first % 9 <= 6 && tiles[first + 1] > 0 && tiles[first + 2] > 0) {
    tiles[first]--;
    tiles[first + 1]--;
    tiles[first + 2]--;
    groups.push({ kind: 'chow', index: first });
    collectDecompositions(tiles, need - 1, groups, pair, out);
    groups.pop();
    tiles[first]++;
    tiles[first + 1]++;
    tiles[first + 2]++;
  }
};

/** 枚举暗手的所有合法标准型拆分（needMelds 副面子 + 1 将）。 */
const enumerateDecompositions = (counts: number[], needMelds: number): Decomposition[] => {
  const out = new Map<string, Decomposition>();
  for (let pair = 0; pair < 34; pair++) {
    if (counts[pair] < 2) continue;
    const rest = [...counts];
    rest[pair] -= 2;
    collectDecompositions(rest, needMelds, [], pair, out);
  }
  return [...out.values()];
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

export const recognizeSichuanPatterns = (
  hand: Tile[], melds: Meld[], lang: Language,
  context: { winSource?: WinSource; winEvent?: SichuanWinEvent | null; wallCount?: number } = {},
): SichuanScore => {
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
  const allMeldsAreTerminal = melds.every(m => m.tiles.some(tile => isTerminalValue(tile.value)));
  const needMelds = 4 - melds.length;

  // 金钩钓：四副碰/杠 + 单钓将，按来源包含对对胡（不再重复计对对胡）
  const isJinGouDiao = melds.length === 4 && allMeldsArePongs && hand.length === 2;
  // 七对：四张相同的牌按两对计
  const isQiDui = melds.length === 0 && allTiles.length === 14 && countPairs(allCounts) === 7 &&
    [...allCounts.values()].every(count => count % 2 === 0);

  // 标准型：每个合法拆分各自成套计番（对对胡要整手刻子，带幺九要每副面子与将都带 1/9）。
  // 同一手牌可能有两种拆分，但一次和牌只能按其中一种结算，因此各拆分成套后择高，不跨拆分相加。
  const standardReadings = enumerateDecompositions(handCounts, needMelds).map(decomposition => {
    const reading: SichuanPatternHit[] = [];
    const allPungs = allMeldsArePongs && decomposition.groups.every(group => group.kind === 'pung');
    if (isJinGouDiao) reading.push({ id: 'jinGouDiao', exponent: SICHUAN_PATTERN_EXPONENTS.jinGouDiao });
    else if (allPungs) reading.push({ id: 'duiDuiHu', exponent: SICHUAN_PATTERN_EXPONENTS.duiDuiHu });
    if (allMeldsAreTerminal &&
      decomposition.groups.every(groupHasTerminal) &&
      isTerminalIndex(decomposition.pair)) {
      reading.push({ id: 'daiYaoJiu', exponent: SICHUAN_PATTERN_EXPONENTS.daiYaoJiu });
    }
    return reading;
  });
  const sum = (patterns: SichuanPatternHit[]) => patterns.reduce((total, hit) => total + hit.exponent, 0);

  const pairHits: SichuanPatternHit[] = [];
  if (isQiDui) {
    pairHits.push({ id: 'qiDui', exponent: SICHUAN_PATTERN_EXPONENTS.qiDui });
    // 七对里的每对必须自身是幺九，不能借用另一种顺子拆分的带幺九。
    if (allTiles.every(tile => isTerminalValue(tile.value))) {
      pairHits.push({ id: 'daiYaoJiu', exponent: SICHUAN_PATTERN_EXPONENTS.daiYaoJiu });
    }
  }
  // 七对与标准面子拆分各是一套读法，分别评分后择高；同为 2 指数番时按七对读法输出。
  const readings: SichuanPatternHit[][] = isQiDui ? [pairHits, ...standardReadings] : standardReadings;
  let bestReading = 0;
  for (let i = 1; i < readings.length; i++) {
    if (sum(readings[i]) > sum(readings[bestReading])) bestReading = i;
  }
  const hits = readings.length > 0 ? [...readings[bestReading]] : [];
  if (isFullFlush) hits.unshift({ id: 'qingYiSe', exponent: SICHUAN_PATTERN_EXPONENTS.qingYiSe });
  if (hits.length === 0) hits.push({ id: 'pingHu', exponent: SICHUAN_PATTERN_EXPONENTS.pingHu });

  const names: Record<SichuanPatternId, string> = {
    pingHu: t.pingHu, duiDuiHu: t.duiDuiHu, qingYiSe: t.qingYiSe,
    qiDui: t.qiDui, daiYaoJiu: t.daiYaoJiu, jinGouDiao: t.jinGouDiao,
  };

  const baseExponent = hits.reduce((total, hit) => total + hit.exponent, 0);
  const eventSource: WinSource | null =
    context.winEvent === 'kongBloom' || context.winEvent === 'lastDraw' ? 'selfDraw' :
    context.winEvent === 'kongDiscard' || context.winEvent === 'robbingKong' || context.winEvent === 'lastDiscard' ? 'claim' : null;
  // 海底捞月/海底炮必须是牌墙最后一张：牌墙还有牌时该事件不成立，宁可漏计也不虚加。
  // 未传牌墙张数（库调用）时不构成矛盾，只按已录入的事件计。
  const lastTileEvent = context.winEvent === 'lastDraw' || context.winEvent === 'lastDiscard';
  const lastTileBlocked = lastTileEvent && typeof context.wallCount === 'number' && context.wallCount > 1;
  // 五类真实和牌事件在 Hi8 口径中各 +1；普通自摸仅改变赔付对象，不自行加番。
  const validEvent = !!eventSource && context.winSource === eventSource && !lastTileBlocked &&
    (context.winEvent !== 'kongBloom' || melds.some(m => m.type === 'gang'));
  const eventExponent = validEvent ? 1 : 0;
  const uncappedExponent = baseExponent + roots + eventExponent;
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
  const eventLabels: Record<Exclude<SichuanWinEvent, 'ordinary'>, { zh: string; en: string }> = {
    kongBloom: { zh: '杠上开花', en: 'Kong bloom' },
    kongDiscard: { zh: '杠上炮', en: 'Kong discard win' },
    robbingKong: { zh: '抢杠胡', en: 'Robbing a kong' },
    lastDraw: { zh: '海底捞月', en: 'Last tile draw' },
    lastDiscard: { zh: '海底炮', en: 'Last tile discard' },
  };
  if (context.winSource === 'selfDraw') details.push(lang === 'zh' ? '自摸：其余未胡玩家付款（人数未记录）' : 'Self-draw: active opponents pay (count unknown)');
  else if (context.winSource === 'claim') details.push(lang === 'zh' ? '点炮：由放炮者付款（未记录具体玩家）' : 'Claim: discarder pays (player unknown)');
  if (validEvent && context.winEvent && context.winEvent !== 'ordinary')
    details.push(`${eventLabels[context.winEvent][lang]} (+1 ${t.exponentUnit})`);
  if (lastTileBlocked) {
    details.push(lang === 'zh'
      ? `已记录牌墙 ${context.wallCount} 张，不是最后一张，海底事件暂不计`
      : `Wall still holds ${context.wallCount} tiles, so the last-tile event does not apply`);
  }
  details.push(uncappedExponent > SICHUAN_RULE.capExponent
    ? `${t.exponentUnit} ${uncappedExponent} → ${lang === 'zh' ? '封顶' : 'capped at'} ${SICHUAN_RULE.capExponent} = ${multiplier} ${t.timesUnit}`
    : `${t.exponentUnit} ${uncappedExponent} = ${multiplier} ${t.timesUnit}`);
  const sourceRecorded = context.winSource && context.winSource !== 'unknown';
  // 整局结算缺少四人牌局事实：这里只列出需要哪些信息，绝不按单人录牌推断对手状态。
  const settlementNeeds = lang === 'zh'
    ? '整局结算还需要：各家是否已胡、杠的归属与类型、是否流局、放炮者是哪家；当前没有这些数据，不推断。'
    : 'Settlement would need each seat\'s win state, kong ownership and type, whether the hand was drawn, and who discarded; none of that is recorded, so nothing is inferred.';
  const pendingContext = sourceRecorded && context.winEvent
    ? (lang === 'zh' ? '仅为单次和牌倍率；杠分与多人支付未结算' : 'Single-win multiplier only; kong payments and multi-player settlement excluded')
    : sourceRecorded
      ? (lang === 'zh' ? '特殊和牌事件未记录，暂不加事件番；杠分与多人支付未结算' : 'Special win event unrecorded; no event bonus; kong payments excluded')
      : t.pendingEvents;
  details.push(pendingContext, settlementNeeds);

  return {
    ruleId: SICHUAN_RULE.id,
    ruleSource: SICHUAN_RULE.source,
    capExponent: SICHUAN_RULE.capExponent,
    label,
    scoreText: `${cappedExponent} ${t.exponentUnit} · ${multiplier} ${t.timesUnit}`,
    patterns: [...hits].sort((a, b) => b.exponent - a.exponent),
    baseExponent,
    roots,
    eventExponent,
    uncappedExponent,
    cappedExponent,
    multiplier,
    details,
    pendingContext,
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
